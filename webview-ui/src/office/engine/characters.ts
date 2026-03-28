import { CharacterState, Direction, TILE_SIZE } from '../types.js'
import type { Character, Seat, SpriteData, TileType as TileTypeVal } from '../types.js'
import type { CharacterSprites } from '../sprites/spriteData.js'
import { findPath, bfsDistanceMap } from '../layout/tileMap.js'
import {
  WALK_SPEED_PX_PER_SEC,
  WALK_FRAME_DURATION_SEC,
  TYPE_FRAME_DURATION_SEC,
  WANDER_PAUSE_MIN_SEC,
  WANDER_PAUSE_MAX_SEC,
  WANDER_MOVES_BEFORE_REST_MIN,
  WANDER_MOVES_BEFORE_REST_MAX,
  SEAT_REST_MIN_SEC,
  SEAT_REST_MAX_SEC,
  IDLE_SEAT_MAX_SEC,
} from '../../constants.js'

/** Tools that show reading animation instead of typing */
const READING_TOOLS = new Set(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch'])

export function isReadingTool(tool: string | null): boolean {
  if (!tool) return false
  return READING_TOOLS.has(tool)
}

/** Pixel center of a tile */
function tileCenter(col: number, row: number): { x: number; y: number } {
  return {
    x: col * TILE_SIZE + TILE_SIZE / 2,
    y: row * TILE_SIZE + TILE_SIZE / 2,
  }
}

/** Direction from one tile to an adjacent tile */
function directionBetween(fromCol: number, fromRow: number, toCol: number, toRow: number): Direction {
  const dc = toCol - fromCol
  const dr = toRow - fromRow
  if (dc > 0) return Direction.RIGHT
  if (dc < 0) return Direction.LEFT
  if (dr > 0) return Direction.DOWN
  return Direction.UP
}

export function createCharacter(
  id: number,
  palette: number,
  seatId: string | null,
  seat: Seat | null,
  hueShift = 0,
): Character {
  const col = seat ? seat.seatCol : 1
  const row = seat ? seat.seatRow : 1
  const center = tileCenter(col, row)
  return {
    id,
    state: CharacterState.TYPE,
    dir: seat ? seat.facingDir : Direction.DOWN,
    x: center.x,
    y: center.y,
    tileCol: col,
    tileRow: row,
    path: [],
    moveProgress: 0,
    currentTool: null,
    palette,
    hueShift,
    frame: 0,
    frameTimer: 0,
    wanderTimer: 0,
    wanderCount: 0,
    wanderLimit: randomInt(WANDER_MOVES_BEFORE_REST_MIN, WANDER_MOVES_BEFORE_REST_MAX),
    isActive: true,
    seatId,
    bubbleType: null,
    bubbleTimer: 0,
    bubbleText: '',
    seatTimer: 0,
    isSubagent: false,
    parentAgentId: null,
    matrixEffect: null,
    matrixEffectTimer: 0,
    matrixEffectSeeds: [],
    loungeTargetSeatId: null,
    leavingOffice: false,
  }
}

/** Minimum tile distance subagent keeps from parent (avoids crowding) */
const SUBAGENT_MIN_DISTANCE = 2
/** Maximum tile distance before subagent starts walking toward parent */
const SUBAGENT_MAX_DISTANCE = 6

/** Check if character is currently sitting on a lounge seat (sofa/bench) */
function isOnLoungeSeat(ch: Character, seats: Map<string, Seat>): boolean {
  for (const seat of seats.values()) {
    if (seat.isLounge && seat.seatCol === ch.tileCol && seat.seatRow === ch.tileRow) return true
  }
  return false
}

/** Find a free lounge seat (sofa/bench, not at a desk) for an idle agent to sit on.
 *  Uses BFS walking distance to pick the nearest reachable seat. */
function findFreeLoungeSeat(
  seats: Map<string, Seat>,
  ch: Character,
  allCharacters?: Map<number, Character>,
  tileMap?: TileTypeVal[][],
  blockedTiles?: Set<string>,
): Seat | null {
  // Build set of claimed seat UIDs (characters walking toward or sitting on a seat)
  const claimedSeats = new Set<string>()
  const occupied = new Set<string>()
  if (allCharacters) {
    for (const other of allCharacters.values()) {
      if (other.id === ch.id) continue
      occupied.add(`${other.tileCol},${other.tileRow}`)
      // Reserve loungeTarget so two characters don't walk to the same sofa
      if (other.loungeTargetSeatId) claimedSeats.add(other.loungeTargetSeatId)
    }
  }

  // Use BFS walking distance if tile map available, otherwise fall back to Manhattan
  const distMap = tileMap && blockedTiles
    ? bfsDistanceMap(ch.tileCol, ch.tileRow, tileMap, blockedTiles)
    : null

  let bestSeat: Seat | null = null
  let bestDist = Infinity
  for (const seat of seats.values()) {
    if (!seat.isLounge) continue
    if (seat.assigned) continue
    if (claimedSeats.has(seat.uid)) continue
    if (ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) continue
    if (occupied.has(`${seat.seatCol},${seat.seatRow}`)) continue
    const dist = distMap
      ? (distMap.get(`${seat.seatCol},${seat.seatRow}`) ?? Infinity)
      : Math.abs(seat.seatCol - ch.tileCol) + Math.abs(seat.seatRow - ch.tileRow)
    if (dist < bestDist) {
      bestDist = dist
      bestSeat = seat
    }
  }
  return bestSeat
}

export function updateCharacter(
  ch: Character,
  dt: number,
  walkableTiles: Array<{ col: number; row: number }>,
  seats: Map<string, Seat>,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
  allCharacters?: Map<number, Character>,
): void {
  ch.frameTimer += dt

  switch (ch.state) {
    case CharacterState.TYPE: {
      if (ch.frameTimer >= TYPE_FRAME_DURATION_SEC) {
        ch.frameTimer -= TYPE_FRAME_DURATION_SEC
        ch.frame = (ch.frame + 1) % 2
      }
      // If active and sitting on a sofa — get up and go to desk
      if (ch.isActive) {
        let onSofa = false
        for (const seat of seats.values()) {
          if (seat.isLounge && seat.seatCol === ch.tileCol && seat.seatRow === ch.tileRow) {
            onSofa = true
            break
          }
        }
        if (onSofa) {
          ch.state = CharacterState.IDLE
          ch.seatTimer = 0
          ch.frame = 0
          ch.frameTimer = 0
          break
        }
      }
      // If no longer active, stand up and start wandering (after seatTimer expires)
      if (!ch.isActive) {
        // On lounge seat (sofa) — stay seated until active again
        if (isOnLoungeSeat(ch, seats)) break

        if (ch.seatTimer > 0) {
          ch.seatTimer -= dt
          break
        }
        ch.seatTimer = 0 // clear sentinel
        ch.state = CharacterState.IDLE
        ch.frame = 0
        ch.frameTimer = 0
        // Immediately try to find a free sofa
        const loungeTarget = findFreeLoungeSeat(seats, ch, allCharacters, tileMap, blockedTiles)
        if (loungeTarget) {
          const path = findPath(ch.tileCol, ch.tileRow, loungeTarget.seatCol, loungeTarget.seatRow, tileMap, blockedTiles)
          if (path.length > 0) {
            ch.path = path
            ch.moveProgress = 0
            ch.state = CharacterState.WALK
            ch.frame = 0
            ch.frameTimer = 0
            ch.loungeTargetSeatId = loungeTarget.uid
            break
          }
        }
        // No sofa available — wander
        ch.wanderTimer = WANDER_PAUSE_MIN_SEC
        ch.wanderCount = 0
        ch.wanderLimit = randomInt(WANDER_MOVES_BEFORE_REST_MIN, WANDER_MOVES_BEFORE_REST_MAX)
      }
      break
    }

    case CharacterState.IDLE: {
      // No idle animation — static pose
      ch.frame = 0
      if (ch.seatTimer < 0) ch.seatTimer = 0 // safety: clear negative values
      // If leaving office, do nothing — just wait for deletion
      if (ch.leavingOffice) break
      // If became active, pathfind to seat
      if (ch.isActive) {
        if (!ch.seatId) {
          // No seat assigned — stay standing (don't sit in air)
          break
        }
        const seat = seats.get(ch.seatId)
        if (seat) {
          const path = findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, tileMap, blockedTiles)
          if (path.length > 0) {
            ch.path = path
            ch.moveProgress = 0
            ch.state = CharacterState.WALK
            ch.frame = 0
            ch.frameTimer = 0
          } else if (ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
            // Already at seat — sit down
            ch.state = CharacterState.TYPE
            ch.dir = seat.facingDir
            ch.frame = 0
            ch.frameTimer = 0
          } else {
            // Can't reach seat (blocked path) — stay idle, retry on next wander cycle
            ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC)
          }
        }
        break
      }
      // Countdown wander timer
      ch.wanderTimer -= dt
      if (ch.wanderTimer <= 0) {
        // Idle agents: try to find a lounge seat (sofa/bench) every wander cycle
        if (!ch.isActive) {
          const loungeTarget = findFreeLoungeSeat(seats, ch, allCharacters, tileMap, blockedTiles)
          if (loungeTarget) {
            const path = findPath(ch.tileCol, ch.tileRow, loungeTarget.seatCol, loungeTarget.seatRow, tileMap, blockedTiles)
            if (path.length > 0) {
              ch.path = path
              ch.moveProgress = 0
              ch.state = CharacterState.WALK
              ch.frame = 0
              ch.frameTimer = 0
              ch.loungeTargetSeatId = loungeTarget.uid
              break
            }
          }
        }
        // Subagent parent-gravitate behavior: when idle, walk toward parent
        if (ch.isSubagent && ch.parentAgentId !== null && allCharacters) {
          const parentCh = allCharacters.get(ch.parentAgentId)
          if (parentCh) {
            const dist = Math.abs(ch.tileCol - parentCh.tileCol) + Math.abs(ch.tileRow - parentCh.tileRow)
            if (dist > SUBAGENT_MAX_DISTANCE) {
              // Too far from parent — walk toward a tile near (but not on top of) parent
              const targetCol = parentCh.tileCol + randomInt(-SUBAGENT_MIN_DISTANCE, SUBAGENT_MIN_DISTANCE)
              const targetRow = parentCh.tileRow + randomInt(-SUBAGENT_MIN_DISTANCE, SUBAGENT_MIN_DISTANCE)
              const path = findPath(ch.tileCol, ch.tileRow, targetCol, targetRow, tileMap, blockedTiles)
              if (path.length > 0) {
                ch.path = path
                ch.moveProgress = 0
                ch.state = CharacterState.WALK
                ch.frame = 0
                ch.frameTimer = 0
                ch.wanderCount++
                ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC)
                break
              }
            }
          }
        }

        // Check if we've wandered enough — return to seat for a rest
        if (ch.wanderCount >= ch.wanderLimit && ch.seatId) {
          const seat = seats.get(ch.seatId)
          if (seat) {
            const path = findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, tileMap, blockedTiles)
            if (path.length > 0) {
              ch.path = path
              ch.moveProgress = 0
              ch.state = CharacterState.WALK
              ch.frame = 0
              ch.frameTimer = 0
              break
            }
          }
        }
        if (walkableTiles.length > 0) {
          // Subagents: bias random wander toward parent's area
          let target: { col: number; row: number }
          if (ch.isSubagent && ch.parentAgentId !== null && allCharacters) {
            const parentCh = allCharacters.get(ch.parentAgentId)
            if (parentCh && Math.random() < 0.6) {
              // 60% chance to pick a walkable tile near parent
              const nearTiles = walkableTiles.filter((t) => {
                const d = Math.abs(t.col - parentCh.tileCol) + Math.abs(t.row - parentCh.tileRow)
                return d >= SUBAGENT_MIN_DISTANCE && d <= SUBAGENT_MAX_DISTANCE
              })
              target = nearTiles.length > 0
                ? nearTiles[Math.floor(Math.random() * nearTiles.length)]
                : walkableTiles[Math.floor(Math.random() * walkableTiles.length)]
            } else {
              target = walkableTiles[Math.floor(Math.random() * walkableTiles.length)]
            }
          } else {
            target = walkableTiles[Math.floor(Math.random() * walkableTiles.length)]
          }
          const path = findPath(ch.tileCol, ch.tileRow, target.col, target.row, tileMap, blockedTiles)
          if (path.length > 0) {
            ch.path = path
            ch.moveProgress = 0
            ch.state = CharacterState.WALK
            ch.frame = 0
            ch.frameTimer = 0
            ch.wanderCount++
          }
        }
        ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC)
      }
      break
    }

    case CharacterState.WALK: {
      // Walk animation
      if (ch.frameTimer >= WALK_FRAME_DURATION_SEC) {
        ch.frameTimer -= WALK_FRAME_DURATION_SEC
        ch.frame = (ch.frame + 1) % 4
      }

      if (ch.path.length === 0) {
        // Path complete — snap to tile center and transition
        const center = tileCenter(ch.tileCol, ch.tileRow)
        ch.x = center.x
        ch.y = center.y

        // If leaving office, stay put — officeState will handle deletion
        if (ch.leavingOffice) {
          ch.state = CharacterState.IDLE
          ch.frame = 0
          ch.frameTimer = 0
          break
        }

        if (ch.isActive) {
          if (!ch.seatId) {
            // No seat — stay standing idle (don't sit in air)
            ch.state = CharacterState.IDLE
            ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC)
          } else {
            const seat = seats.get(ch.seatId)
            if (seat && ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
              ch.state = CharacterState.TYPE
              ch.dir = seat.facingDir
            } else {
              ch.state = CharacterState.IDLE
            }
          }
        } else {
          // Check if arrived at a lounge seat (sofa/bench) — sit and chill
          if (ch.loungeTargetSeatId) {
            const loungeSeat = seats.get(ch.loungeTargetSeatId)
            if (loungeSeat && ch.tileCol === loungeSeat.seatCol && ch.tileRow === loungeSeat.seatRow) {
              ch.state = CharacterState.TYPE
              ch.dir = loungeSeat.facingDir
              ch.frame = 0
              ch.frameTimer = 0
              ch.seatTimer = 9999 // sit on sofa until active again
              ch.loungeTargetSeatId = null
              break
            }
            ch.loungeTargetSeatId = null
          }
          // Check if arrived at assigned seat — sit down for a rest before wandering again
          if (ch.seatId) {
            const seat = seats.get(ch.seatId)
            if (seat && ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
              ch.state = CharacterState.TYPE
              ch.dir = seat.facingDir
              if (!ch.isActive) {
                // Idle agents: never rest at desk — transition to IDLE immediately
                ch.seatTimer = 0
              } else {
                ch.seatTimer = randomRange(SEAT_REST_MIN_SEC, SEAT_REST_MAX_SEC)
              }
              ch.wanderCount = 0
              ch.wanderLimit = randomInt(WANDER_MOVES_BEFORE_REST_MIN, WANDER_MOVES_BEFORE_REST_MAX)
              ch.frame = 0
              ch.frameTimer = 0
              break
            }
          }
          ch.state = CharacterState.IDLE
          ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC)
        }
        ch.frame = 0
        ch.frameTimer = 0
        break
      }

      // Move toward next tile in path
      const nextTile = ch.path[0]
      ch.dir = directionBetween(ch.tileCol, ch.tileRow, nextTile.col, nextTile.row)

      ch.moveProgress += (WALK_SPEED_PX_PER_SEC / TILE_SIZE) * dt

      const fromCenter = tileCenter(ch.tileCol, ch.tileRow)
      const toCenter = tileCenter(nextTile.col, nextTile.row)
      const t = Math.min(ch.moveProgress, 1)
      ch.x = fromCenter.x + (toCenter.x - fromCenter.x) * t
      ch.y = fromCenter.y + (toCenter.y - fromCenter.y) * t

      if (ch.moveProgress >= 1) {
        // Arrived at next tile
        ch.tileCol = nextTile.col
        ch.tileRow = nextTile.row
        ch.x = toCenter.x
        ch.y = toCenter.y
        ch.path.shift()
        ch.moveProgress = 0
      }

      // If became active while wandering, repath to seat (skip if leaving office)
      if (ch.isActive && ch.seatId && !ch.leavingOffice) {
        const seat = seats.get(ch.seatId)
        if (seat) {
          const lastStep = ch.path[ch.path.length - 1]
          if (!lastStep || lastStep.col !== seat.seatCol || lastStep.row !== seat.seatRow) {
            const newPath = findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, tileMap, blockedTiles)
            if (newPath.length > 0) {
              ch.path = newPath
              ch.moveProgress = 0
            }
          }
        }
      }
      break
    }
  }
}

/** Get the correct sprite frame for a character's current state and direction */
export function getCharacterSprite(ch: Character, sprites: CharacterSprites): SpriteData {
  switch (ch.state) {
    case CharacterState.TYPE:
      if (isReadingTool(ch.currentTool)) {
        return sprites.reading[ch.dir][ch.frame % 2]
      }
      return sprites.typing[ch.dir][ch.frame % 2]
    case CharacterState.WALK:
      return sprites.walk[ch.dir][ch.frame % 4]
    case CharacterState.IDLE:
      return sprites.walk[ch.dir][1]
    default:
      return sprites.walk[ch.dir][1]
  }
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}
