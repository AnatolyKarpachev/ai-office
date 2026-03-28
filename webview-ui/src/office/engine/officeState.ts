import { TILE_SIZE, MATRIX_EFFECT_DURATION, CharacterState, Direction } from '../types.js'
import {
  AUTO_ON_FACING_DEPTH,
  AUTO_ON_SIDE_DEPTH,
  CHARACTER_HIT_HALF_WIDTH,
  CHARACTER_HIT_HEIGHT,
  CHARACTER_SITTING_OFFSET_PX,
  DISMISS_BUBBLE_FAST_FADE_SEC,
  FURNITURE_ANIM_INTERVAL_SEC,
  HUE_SHIFT_MIN_DEG,
  HUE_SHIFT_RANGE_DEG,
  INACTIVE_SEAT_TIMER_MIN_SEC,
  INACTIVE_SEAT_TIMER_RANGE_SEC,
  PALETTE_COUNT,
  WAITING_BUBBLE_DURATION_SEC,
  ACTIVITY_BUBBLE_DURATION_SEC,
  ACTIVITY_BUBBLE_MAX_CHARS,
  IDLE_SEAT_MAX_SEC,
  TEAM_PRIORITY_WEIGHTS,
  TEAM_SIBLING_BONUS,
  TEAM_SIBLING_RADIUS,
  TEAM_MAX_DEPTH,
} from '../../constants.js'
import type { Character, Seat, FurnitureInstance, TileType as TileTypeVal, OfficeLayout, PlacedFurniture } from '../types.js'
import { createCharacter, updateCharacter } from './characters.js'
import { matrixEffectSeeds } from './matrixEffect.js'
import { isWalkable, getWalkableTiles, findPath } from '../layout/tileMap.js'
import {
  createDefaultLayout,
  layoutToTileMap,
  layoutToFurnitureInstances,
  layoutToSeats,
  getBlockedTiles,
  getIdleBlockedTiles,
  getSeatTiles,
} from '../layout/layoutSerializer.js'
import { getAnimationFrames, getCatalogEntry, getOnStateType } from '../layout/furnitureCatalog.js'

/** Entrance tile where characters appear/disappear (office door) */
const ENTRANCE_COL = 39
const ENTRANCE_ROW = 39

/** Door bridge tiles — blocked by furniture but characters walk through to enter/exit */
const DOOR_BRIDGE_TILES = new Set(['26,37', '26,38', '27,38', '26,39', '27,39'])

/** Facing direction overrides for specific seat positions (col,row → Direction) */
const SEAT_FACING_OVERRIDES = new Map<string, Direction>([
  ['4,17', Direction.UP],      // sofa — back to viewer
  ['5,15', Direction.DOWN],    // face toward viewer
  ['24,36', Direction.RIGHT],  // face right
  ['26,36', Direction.LEFT],   // face left
])

export class OfficeState {
  layout: OfficeLayout
  tileMap: TileTypeVal[][]
  seats: Map<string, Seat>
  blockedTiles: Set<string>
  /** Empty blocked tiles for idle agents — they can walk through furniture */
  idleBlockedTiles: Set<string> = new Set()
  furniture: FurnitureInstance[]
  walkableTiles: Array<{ col: number; row: number }>
  characters: Map<number, Character> = new Map()
  /** Accumulated time for furniture animation frame cycling */
  furnitureAnimTimer = 0
  selectedAgentId: number | null = null
  cameraFollowId: number | null = null
  hoveredAgentId: number | null = null
  hoveredTile: { col: number; row: number } | null = null
  /** Maps "parentId:toolId" → sub-agent character ID (negative) */
  subagentIdMap: Map<string, number> = new Map()
  /** Reverse lookup: sub-agent character ID → parent info */
  subagentMeta: Map<number, { parentAgentId: number; parentToolId: string }> = new Map()
  /** Agent role strings (e.g. "boss") — used for role-restricted seat assignment */
  agentRoles: Map<number, string> = new Map()
  private nextSubagentId = -1

  constructor(layout?: OfficeLayout) {
    this.layout = layout || createDefaultLayout()
    this.tileMap = layoutToTileMap(this.layout)
    this.seats = layoutToSeats(this.layout.furniture)
    this.applySeatFacingOverrides()
    const seatTiles = getSeatTiles(this.seats)
    this.blockedTiles = getBlockedTiles(this.layout.furniture, seatTiles)
    this.idleBlockedTiles = getIdleBlockedTiles(this.layout.furniture, seatTiles)
    this.furniture = layoutToFurnitureInstances(this.layout.furniture)
    this.walkableTiles = getWalkableTiles(this.tileMap, this.blockedTiles)
  }

  /** Rebuild all derived state from a new layout. Reassigns existing characters.
   *  @param shift Optional pixel shift to apply when grid expands left/up */
  /** Apply facing direction overrides for specific seat positions */
  private applySeatFacingOverrides(): void {
    for (const [, seat] of this.seats) {
      const key = `${seat.seatCol},${seat.seatRow}`
      const override = SEAT_FACING_OVERRIDES.get(key)
      if (override !== undefined) {
        seat.facingDir = override
      }
    }
  }

  rebuildFromLayout(layout: OfficeLayout, shift?: { col: number; row: number }): void {
    this.layout = layout
    this.tileMap = layoutToTileMap(layout)
    this.seats = layoutToSeats(layout.furniture)
    this.applySeatFacingOverrides()
    const seatTiles = getSeatTiles(this.seats)
    this.blockedTiles = getBlockedTiles(layout.furniture, seatTiles)
    this.idleBlockedTiles = getIdleBlockedTiles(layout.furniture, seatTiles)
    this.rebuildFurnitureInstances()
    this.walkableTiles = getWalkableTiles(this.tileMap, this.blockedTiles)

    // Shift character positions when grid expands left/up
    if (shift && (shift.col !== 0 || shift.row !== 0)) {
      for (const ch of this.characters.values()) {
        ch.tileCol += shift.col
        ch.tileRow += shift.row
        ch.x += shift.col * TILE_SIZE
        ch.y += shift.row * TILE_SIZE
        // Clear path since tile coords changed
        ch.path = []
        ch.moveProgress = 0
      }
    }

    // Reassign characters to new seats, preserving existing assignments when possible
    // Hard invariant: one seat = one character
    for (const seat of this.seats.values()) {
      seat.assigned = false
    }

    // First pass: try to keep characters at their existing seats
    for (const ch of this.characters.values()) {
      if (ch.seatId && this.seats.has(ch.seatId)) {
        const seat = this.seats.get(ch.seatId)!
        if (!seat.assigned && !this.isSeatClaimed(ch.seatId, ch.id)) {
          seat.assigned = true
          // Snap character to seat position
          ch.tileCol = seat.seatCol
          ch.tileRow = seat.seatRow
          const cx = seat.seatCol * TILE_SIZE + TILE_SIZE / 2
          const cy = seat.seatRow * TILE_SIZE + TILE_SIZE / 2
          ch.x = cx
          ch.y = cy
          ch.dir = seat.facingDir
          continue
        }
      }
      ch.seatId = null // will be reassigned below
    }

    // Second pass: assign remaining characters to free seats
    for (const ch of this.characters.values()) {
      if (ch.seatId) continue
      const seatId = this.findFreeSeat()
      if (seatId && this.claimSeat(seatId)) {
        ch.seatId = seatId
        const seat = this.seats.get(seatId)!
        ch.tileCol = seat.seatCol
        ch.tileRow = seat.seatRow
        ch.x = seat.seatCol * TILE_SIZE + TILE_SIZE / 2
        ch.y = seat.seatRow * TILE_SIZE + TILE_SIZE / 2
        ch.dir = seat.facingDir
      }
    }

    // Relocate any characters that ended up outside bounds or on non-walkable tiles
    for (const ch of this.characters.values()) {
      if (ch.seatId) continue // seated characters are fine
      if (ch.tileCol < 0 || ch.tileCol >= layout.cols || ch.tileRow < 0 || ch.tileRow >= layout.rows) {
        this.relocateCharacterToWalkable(ch)
      }
    }
  }

  /** Move a character to a random walkable tile */
  private relocateCharacterToWalkable(ch: Character): void {
    if (this.walkableTiles.length === 0) return
    const spawn = this.walkableTiles[Math.floor(Math.random() * this.walkableTiles.length)]
    ch.tileCol = spawn.col
    ch.tileRow = spawn.row
    ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2
    ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2
    ch.path = []
    ch.moveProgress = 0
  }

  getLayout(): OfficeLayout {
    return this.layout
  }

  /** Get the blocked-tile key for a character's own seat, or null */
  private ownSeatKey(ch: Character): string | null {
    if (!ch.seatId) return null
    const seat = this.seats.get(ch.seatId)
    if (!seat) return null
    return `${seat.seatCol},${seat.seatRow}`
  }

  /** Temporarily unblock a character's own seat, run fn, then restore original state */
  private withOwnSeatUnblocked<T>(ch: Character, fn: () => T): T {
    const key = this.ownSeatKey(ch)
    const wasBlocked = key ? this.blockedTiles.has(key) : false
    if (key) this.blockedTiles.delete(key)
    const result = fn()
    if (key && wasBlocked) this.blockedTiles.add(key)
    return result
  }

  /** Check if a seatId is already claimed by any live character (skip despawning).
   *  @param excludeId  Optional character ID to exclude from the check (e.g. the character itself) */
  private isSeatClaimed(seatId: string, excludeId?: number): boolean {
    for (const ch of this.characters.values()) {
      if (ch.id === excludeId) continue
      if (ch.seatId === seatId && ch.matrixEffect !== 'despawn') return true
    }
    return false
  }

  /** Claim a seat: mark assigned + verify no other character holds it */
  private claimSeat(seatId: string): boolean {
    const seat = this.seats.get(seatId)
    if (!seat) return false
    if (seat.assigned || this.isSeatClaimed(seatId)) return false
    seat.assigned = true
    return true
  }

  /** Check if an agent's role allows them to sit in a given seat */
  private canSitInSeat(seat: Seat, agentId: number): boolean {
    if (!seat.requiredRoles) return true // unrestricted seat
    const role = this.agentRoles.get(agentId)
    return !!role && seat.requiredRoles.includes(role)
  }

  // ── Team Clustering ──────────────────────────────────────────

  /** Walk up parent chain to find the root agent and hierarchy depth.
   *  Returns { priority: 1-4, chainRoot: root agent ID } */
  getAgentPriority(agentId: number): { priority: number; chainRoot: number } {
    let current = agentId
    let depth = 0
    for (let i = 0; i < TEAM_MAX_DEPTH; i++) {
      const ch = this.characters.get(current)
      const meta = this.subagentMeta.get(current)
      const parentId = ch?.parentAgentId ?? meta?.parentAgentId
      if (parentId == null || !this.characters.has(parentId)) break
      current = parentId
      depth++
    }
    return { priority: Math.min(depth + 1, 4), chainRoot: current }
  }

  /** Collect all characters belonging to the cluster rooted at chainRoot */
  private getClusterMembers(chainRoot: number): Array<{ id: number; col: number; row: number; weight: number }> {
    const members: Array<{ id: number; col: number; row: number; weight: number }> = []
    // Add root
    const rootCh = this.characters.get(chainRoot)
    if (rootCh && !rootCh.matrixEffect) {
      members.push({ id: chainRoot, col: rootCh.tileCol, row: rootCh.tileRow, weight: TEAM_PRIORITY_WEIGHTS[1] })
    }
    // Find all descendants
    for (const ch of this.characters.values()) {
      if (ch.id === chainRoot || ch.matrixEffect) continue
      const info = this.getAgentPriority(ch.id)
      if (info.chainRoot === chainRoot) {
        members.push({ id: ch.id, col: ch.tileCol, row: ch.tileRow, weight: TEAM_PRIORITY_WEIGHTS[info.priority] ?? 0.5 })
      }
    }
    return members
  }

  /** Compute weighted centroid of a cluster */
  private getClusterCentroid(chainRoot: number): { col: number; row: number; members: Array<{ id: number; col: number; row: number; weight: number }> } {
    const members = this.getClusterMembers(chainRoot)
    if (members.length === 0) return { col: 0, row: 0, members }
    let wSum = 0, cCol = 0, cRow = 0
    for (const m of members) {
      wSum += m.weight
      cCol += m.weight * m.col
      cRow += m.weight * m.row
    }
    return { col: cCol / wSum, row: cRow / wSum, members }
  }

  /** Score a seat for team clustering.
   *  Lower score = better seat.
   *  β·d(seat,parent) + α·d(seat,centroid) + γ·nearby_teammates */
  private scoreClusterSeat(
    seat: Seat,
    parentCol: number, parentRow: number,
    centroidCol: number, centroidRow: number,
    priority: number,
    teammates: Array<{ col: number; row: number }>,
  ): number {
    const beta = Math.max(0, 4 - priority)  // P1:3, P2:2, P3:1, P4:0
    const alpha = priority - 1               // P1:0, P2:1, P3:2, P4:3
    const dParent = Math.abs(seat.seatCol - parentCol) + Math.abs(seat.seatRow - parentRow)
    const dCentroid = Math.abs(seat.seatCol - centroidCol) + Math.abs(seat.seatRow - centroidRow)
    let nearbyCount = 0
    for (const t of teammates) {
      if (Math.abs(seat.seatCol - t.col) + Math.abs(seat.seatRow - t.row) <= TEAM_SIBLING_RADIUS) {
        nearbyCount++
      }
    }
    return beta * dParent + alpha * dCentroid + TEAM_SIBLING_BONUS * nearbyCount
  }

  /** Check if a seat is role-restricted and the agent's role matches */
  private isRoleSeatForAgent(seat: Seat, agentId: number): boolean {
    if (!seat.requiredRoles) return false
    const role = this.agentRoles.get(agentId)
    return !!role && seat.requiredRoles.includes(role)
  }

  private findFreeSeat(agentId?: number): string | null {
    // Priority 0: role-restricted seats for matching agents (boss/lead/megaboss)
    if (agentId !== undefined) {
      for (const [uid, seat] of this.seats) {
        if (!seat.assigned && !seat.isLounge && !this.isSeatClaimed(uid)
            && this.isRoleSeatForAgent(seat, agentId)) return uid
      }
    }

    // Priority 1: desk-facing non-lounge seats (workstations), skip role-restricted seats
    for (const [uid, seat] of this.seats) {
      if (!seat.assigned && !seat.isLounge && seat.facesDesk && !this.isSeatClaimed(uid)
          && (agentId === undefined || this.canSitInSeat(seat, agentId))) return uid
    }
    // Priority 2: any non-lounge seats, skip role-restricted seats
    for (const [uid, seat] of this.seats) {
      if (!seat.assigned && !seat.isLounge && !this.isSeatClaimed(uid)
          && (agentId === undefined || this.canSitInSeat(seat, agentId))) return uid
    }
    // Lounge seats (sofas, benches) are NEVER assigned as workstations
    return null
  }

  /** Find the best free seat using team cluster scoring.
   *  Uses weighted centroid + parent proximity + sibling attraction.
   *  Parent position is based on their assigned SEAT (last active position),
   *  not their current wandering tile. */
  private findFreeSeatNear(parentAgentId: number, agentId?: number): string | null {
    const parentCh = this.characters.get(parentAgentId)
    if (!parentCh) return this.findFreeSeat(agentId)

    // Use parent's seat position (stable work location) instead of current tile (may be wandering)
    const parentSeat = parentCh.seatId ? this.seats.get(parentCh.seatId) : null
    const parentCol = parentSeat ? parentSeat.seatCol : parentCh.tileCol
    const parentRow = parentSeat ? parentSeat.seatRow : parentCh.tileRow

    // Compute cluster info for team-aware scoring
    const { chainRoot, priority } = agentId !== undefined
      ? { chainRoot: this.getAgentPriority(parentAgentId).chainRoot, priority: Math.min(this.getAgentPriority(parentAgentId).priority + 1, 4) }
      : { chainRoot: parentAgentId, priority: 2 }
    const cluster = this.getClusterCentroid(chainRoot)
    const teammates = cluster.members.map(m => ({ col: m.col, row: m.row }))

    const score = (seat: Seat) => this.scoreClusterSeat(
      seat, parentCol, parentRow, cluster.col, cluster.row, priority, teammates,
    )

    let bestSeatId: string | null = null
    let bestScore = Infinity

    // Role-restricted seats (boss/lead/megaboss)
    if (agentId !== undefined) {
      for (const [uid, seat] of this.seats) {
        if (seat.assigned || seat.isLounge || this.isSeatClaimed(uid)) continue
        if (!this.isRoleSeatForAgent(seat, agentId)) continue
        const s = score(seat)
        if (s < bestScore) { bestScore = s; bestSeatId = uid }
      }
      if (bestSeatId) return bestSeatId
      bestScore = Infinity
    }

    // Desk-facing non-lounge seats, scored by cluster proximity
    for (const [uid, seat] of this.seats) {
      if (seat.assigned || seat.isLounge || !seat.facesDesk || this.isSeatClaimed(uid)) continue
      if (agentId !== undefined && !this.canSitInSeat(seat, agentId)) continue
      const s = score(seat)
      if (s < bestScore) { bestScore = s; bestSeatId = uid }
    }
    // Any non-lounge seats
    if (!bestSeatId) {
      bestScore = Infinity
      for (const [uid, seat] of this.seats) {
        if (seat.assigned || seat.isLounge || this.isSeatClaimed(uid)) continue
        if (agentId !== undefined && !this.canSitInSeat(seat, agentId)) continue
        const s = score(seat)
        if (s < bestScore) { bestScore = s; bestSeatId = uid }
      }
    }
    return bestSeatId
  }

  /** Update agent role and reassign to a role-appropriate seat if needed */
  setAgentRole(agentId: number, role: string): void {
    this.agentRoles.set(agentId, role)
    const ch = this.characters.get(agentId)
    if (!ch) return

    // Check if current seat is appropriate for the new role
    if (ch.seatId) {
      const currentSeat = this.seats.get(ch.seatId)
      if (currentSeat) {
        // If in a role-restricted seat that doesn't match, vacate
        if (currentSeat.requiredRoles && !currentSeat.requiredRoles.includes(role)) {
          currentSeat.assigned = false
          ch.seatId = null
        }
        // If there's a role-restricted seat available and agent qualifies, move to closest to team
        else if (!currentSeat.requiredRoles) {
          const cluster = this.getClusterCentroid(this.getAgentPriority(agentId).chainRoot)
          let bestUid: string | null = null
          let bestDist = Infinity
          for (const [uid, seat] of this.seats) {
            if (!seat.requiredRoles || !seat.requiredRoles.includes(role)) continue
            if (seat.assigned || this.isSeatClaimed(uid)) continue
            const d = Math.abs(seat.seatCol - cluster.col) + Math.abs(seat.seatRow - cluster.row)
            if (d < bestDist) { bestDist = d; bestUid = uid }
          }
          if (bestUid) {
            currentSeat.assigned = false
            if (this.claimSeat(bestUid)) {
              ch.seatId = bestUid
              this.sendToSeat(agentId)
            }
            return
          }
        }
      }
    }

    // If no seat yet, find one matching the role
    if (!ch.seatId) {
      const seatId = this.findFreeSeat(agentId)
      if (seatId && this.claimSeat(seatId)) {
        ch.seatId = seatId
        this.sendToSeat(agentId)
      }
    }
  }

  /** Force-sweep: move all agents with roles to their role-restricted seats.
   *  Called after initial load and after any seat save to prevent drift. */
  enforceRoleSeats(): void {
    // Collect agents that qualify for role-restricted seats, sorted by priority (P1 first)
    const candidates: Array<{ id: number; priority: number }> = []
    for (const [id, role] of this.agentRoles) {
      const ch = this.characters.get(id)
      if (!ch || ch.matrixEffect === 'despawn') continue
      // Check if any role-restricted seat exists for this role
      let hasRoleSeat = false
      for (const seat of this.seats.values()) {
        if (seat.requiredRoles && seat.requiredRoles.includes(role)) { hasRoleSeat = true; break }
      }
      if (!hasRoleSeat) continue
      // Check if already in a role-restricted seat
      if (ch.seatId) {
        const currentSeat = this.seats.get(ch.seatId)
        if (currentSeat?.requiredRoles && currentSeat.requiredRoles.includes(role)) continue // already correct
      }
      candidates.push({ id, priority: this.getAgentPriority(id).priority })
    }
    // Sort: lower priority number = higher rank = first pick
    candidates.sort((a, b) => a.priority - b.priority)

    for (const { id } of candidates) {
      const ch = this.characters.get(id)
      if (!ch) continue
      const role = this.agentRoles.get(id)
      if (!role) continue

      // Find best free role-restricted seat — closest to team cluster, not current wandering position
      const cluster = this.getClusterCentroid(this.getAgentPriority(id).chainRoot)
      let bestUid: string | null = null
      let bestDist = Infinity
      for (const [uid, seat] of this.seats) {
        if (!seat.requiredRoles || !seat.requiredRoles.includes(role)) continue
        if (seat.assigned || this.isSeatClaimed(uid)) continue
        const d = Math.abs(seat.seatCol - cluster.col) + Math.abs(seat.seatRow - cluster.row)
        if (d < bestDist) { bestDist = d; bestUid = uid }
      }
      if (!bestUid) continue

      // Vacate current seat
      if (ch.seatId) {
        const old = this.seats.get(ch.seatId)
        if (old) old.assigned = false
        ch.seatId = null
      }
      // Claim new role-restricted seat
      if (this.claimSeat(bestUid)) {
        ch.seatId = bestUid
        const seat = this.seats.get(bestUid)!
        // Walk to new seat
        const path = this.withOwnSeatUnblocked(ch, () =>
          findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, this.tileMap, this.blockedTiles)
        )
        if (path.length > 0) {
          ch.path = path
          ch.moveProgress = 0
          ch.state = CharacterState.WALK
          ch.frame = 0
          ch.frameTimer = 0
        } else {
          // Already there or no path — snap
          ch.tileCol = seat.seatCol
          ch.tileRow = seat.seatRow
          ch.x = seat.seatCol * TILE_SIZE + TILE_SIZE / 2
          ch.y = seat.seatRow * TILE_SIZE + TILE_SIZE / 2
          ch.state = CharacterState.TYPE
          ch.dir = seat.facingDir
        }
      }
    }
  }

  /**
   * Pick a diverse palette for a new agent based on currently active agents.
   * First 6 agents each get a unique skin (random order). Beyond 6, skins
   * repeat in balanced rounds with a random hue shift (≥45°).
   */
  private pickDiversePalette(): { palette: number; hueShift: number } {
    // Count how many non-sub-agents use each base palette (0-5)
    const counts = new Array(PALETTE_COUNT).fill(0) as number[]
    for (const ch of this.characters.values()) {
      if (ch.isSubagent) continue
      counts[ch.palette]++
    }
    const minCount = Math.min(...counts)
    // Available = palettes at the minimum count (least used)
    const available: number[] = []
    for (let i = 0; i < PALETTE_COUNT; i++) {
      if (counts[i] === minCount) available.push(i)
    }
    const palette = available[Math.floor(Math.random() * available.length)]
    // First round (minCount === 0): no hue shift. Subsequent rounds: random ≥45°.
    let hueShift = 0
    if (minCount > 0) {
      hueShift = HUE_SHIFT_MIN_DEG + Math.floor(Math.random() * HUE_SHIFT_RANGE_DEG)
    }
    return { palette, hueShift }
  }

  /** Get blocked tiles with door bridge tiles unblocked for entrance/exit pathfinding */
  private getEntranceBlockedTiles(): Set<string> {
    const bt = new Set(this.blockedTiles)
    for (const k of DOOR_BRIDGE_TILES) bt.delete(k)
    return bt
  }

  /** Build a path from the entrance tile to a target tile, unblocking door tiles */
  private buildPathFromEntrance(toCol: number, toRow: number): Array<{ col: number; row: number }> {
    const bt = this.getEntranceBlockedTiles()
    // Try direct pathfinding with door unblocked
    const direct = findPath(ENTRANCE_COL, ENTRANCE_ROW, toCol, toRow, this.tileMap, bt)
    if (direct.length > 0) return direct

    // Fallback: find nearest walkable tile to entrance and build manual bridge
    let nearest: { col: number; row: number } | null = null
    let bestDist = Infinity
    for (const t of this.walkableTiles) {
      const d = Math.abs(t.col - ENTRANCE_COL) + Math.abs(t.row - ENTRANCE_ROW)
      if (d < bestDist) { bestDist = d; nearest = t }
    }
    if (!nearest) return []

    const manual: Array<{ col: number; row: number }> = []
    let cx = ENTRANCE_COL, cy = ENTRANCE_ROW
    while (cx !== nearest.col || cy !== nearest.row) {
      if (cx !== nearest.col) cx += Math.sign(nearest.col - cx)
      else cy += Math.sign(nearest.row - cy)
      manual.push({ col: cx, row: cy })
    }

    const bfs = findPath(nearest.col, nearest.row, toCol, toRow, this.tileMap, bt)
    if (bfs.length === 0 && (nearest.col !== toCol || nearest.row !== toRow)) return []

    return [...manual, ...bfs]
  }

  /** Build a path from a source tile to the entrance tile, unblocking door tiles */
  private buildPathToEntrance(fromCol: number, fromRow: number): Array<{ col: number; row: number }> {
    const bt = this.getEntranceBlockedTiles()
    // Try direct pathfinding with door unblocked
    const direct = findPath(fromCol, fromRow, ENTRANCE_COL, ENTRANCE_ROW, this.tileMap, bt)
    if (direct.length > 0) return direct

    // Fallback: find nearest walkable tile to entrance and build manual bridge
    let nearest: { col: number; row: number } | null = null
    let bestDist = Infinity
    for (const t of this.walkableTiles) {
      const d = Math.abs(t.col - ENTRANCE_COL) + Math.abs(t.row - ENTRANCE_ROW)
      if (d < bestDist) { bestDist = d; nearest = t }
    }
    if (!nearest) return []

    const bfs = findPath(fromCol, fromRow, nearest.col, nearest.row, this.tileMap, bt)
    if (bfs.length === 0 && (fromCol !== nearest.col || fromRow !== nearest.row)) return []

    const manual: Array<{ col: number; row: number }> = []
    let cx = nearest.col, cy = nearest.row
    while (cx !== ENTRANCE_COL || cy !== ENTRANCE_ROW) {
      if (cx !== ENTRANCE_COL) cx += Math.sign(ENTRANCE_COL - cx)
      else cy += Math.sign(ENTRANCE_ROW - cy)
      manual.push({ col: cx, row: cy })
    }

    return [...bfs, ...manual]
  }

  /** Start the leave-office sequence: walk to entrance and despawn */
  private startLeaveOffice(ch: Character): void {
    ch.leavingOffice = true
    ch.isActive = false
    ch.bubbleType = null
    ch.bubbleTimer = 0
    ch.loungeTargetSeatId = null
    // Build path to entrance
    const path = this.buildPathToEntrance(ch.tileCol, ch.tileRow)
    if (path.length > 0) {
      ch.path = path
      ch.moveProgress = 0
      ch.state = CharacterState.WALK
      ch.frame = 0
      ch.frameTimer = 0
    } else {
      // No path to entrance — fall back to matrix despawn at current position
      ch.leavingOffice = false
      ch.matrixEffect = 'despawn'
      ch.matrixEffectTimer = 0
      ch.matrixEffectSeeds = matrixEffectSeeds()
    }
  }

  addAgent(id: number, preferredPalette?: number, preferredHueShift?: number, preferredSeatId?: string, skipSpawnEffect?: boolean, folderName?: string, parentAgentId?: number): void {
    if (this.characters.has(id)) return

    let palette: number
    let hueShift: number
    if (preferredPalette !== undefined) {
      palette = preferredPalette
      hueShift = preferredHueShift ?? 0
    } else if (parentAgentId !== undefined) {
      // Subagent: inherit parent's palette with a slight hue shift
      const parentCh = this.characters.get(parentAgentId)
      if (parentCh) {
        palette = parentCh.palette
        hueShift = parentCh.hueShift
      } else {
        const pick = this.pickDiversePalette()
        palette = pick.palette
        hueShift = pick.hueShift
      }
    } else {
      const pick = this.pickDiversePalette()
      palette = pick.palette
      hueShift = pick.hueShift
    }

    // Try role-restricted seat first (boss/lead agents get priority for their chairs),
    // then preferred seat, then find a seat near parent (if subagent), then any free seat.
    // Hard invariant: one seat = one character, verified by claimSeat
    let seatId: string | null = null

    // If agent has a role, check for matching role-restricted seats first
    const agentRole = this.agentRoles.get(id)
    if (agentRole) {
      for (const [uid, seat] of this.seats) {
        if (seat.requiredRoles && seat.requiredRoles.includes(agentRole)
            && !seat.assigned && !this.isSeatClaimed(uid)) {
          if (this.claimSeat(uid)) { seatId = uid; break }
        }
      }
    }

    if (!seatId && preferredSeatId && this.claimSeat(preferredSeatId)) {
      seatId = preferredSeatId
    }
    if (!seatId && parentAgentId !== undefined) {
      seatId = this.findFreeSeatNear(parentAgentId, id)
    }
    if (!seatId) {
      seatId = this.findFreeSeat(id)
    }
    // Claim the found seat (findFreeSeat doesn't mark assigned)
    if (seatId && !this.seats.get(seatId)?.assigned) {
      if (!this.claimSeat(seatId)) seatId = null
    }

    let ch: Character
    if (seatId) {
      const seat = this.seats.get(seatId)!
      ch = createCharacter(id, palette, seatId, seat, hueShift)
    } else {
      // No seats — spawn at random walkable tile (or near parent if subagent)
      let spawn = { col: 1, row: 1 }
      if (parentAgentId !== undefined) {
        const parentCh = this.characters.get(parentAgentId)
        if (parentCh && this.walkableTiles.length > 0) {
          // Find closest walkable tile to parent
          let best = this.walkableTiles[0]
          let bestDist = Math.abs(best.col - parentCh.tileCol) + Math.abs(best.row - parentCh.tileRow)
          for (let i = 1; i < this.walkableTiles.length; i++) {
            const d = Math.abs(this.walkableTiles[i].col - parentCh.tileCol) + Math.abs(this.walkableTiles[i].row - parentCh.tileRow)
            if (d < bestDist) {
              best = this.walkableTiles[i]
              bestDist = d
            }
          }
          spawn = best
        }
      } else if (this.walkableTiles.length > 0) {
        spawn = this.walkableTiles[Math.floor(Math.random() * this.walkableTiles.length)]
      }
      ch = createCharacter(id, palette, null, null, hueShift)
      ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2
      ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2
      ch.tileCol = spawn.col
      ch.tileRow = spawn.row
      // No seat — don't type on the floor, stay idle
      ch.state = CharacterState.IDLE
      ch.wanderTimer = 0
    }

    if (folderName) {
      ch.folderName = folderName
    }
    if (parentAgentId !== undefined) {
      ch.isSubagent = true
      ch.parentAgentId = parentAgentId
    }
    if (!skipSpawnEffect) {
      // Enter through the office door: spawn at entrance and walk to seat
      const targetCol = ch.tileCol
      const targetRow = ch.tileRow
      ch.x = ENTRANCE_COL * TILE_SIZE + TILE_SIZE / 2
      ch.y = ENTRANCE_ROW * TILE_SIZE + TILE_SIZE / 2
      ch.tileCol = ENTRANCE_COL
      ch.tileRow = ENTRANCE_ROW
      const path = this.buildPathFromEntrance(targetCol, targetRow)
      if (path.length > 0) {
        ch.path = path
        ch.moveProgress = 0
        ch.state = CharacterState.WALK
        ch.frame = 0
        ch.frameTimer = 0
      } else {
        // No path from entrance — fall back to matrix spawn at seat
        ch.x = targetCol * TILE_SIZE + TILE_SIZE / 2
        ch.y = targetRow * TILE_SIZE + TILE_SIZE / 2
        ch.tileCol = targetCol
        ch.tileRow = targetRow
        ch.matrixEffect = 'spawn'
        ch.matrixEffectTimer = 0
        ch.matrixEffectSeeds = matrixEffectSeeds()
      }
    }
    this.characters.set(id, ch)
  }

  removeAgent(id: number): void {
    const ch = this.characters.get(id)
    if (!ch) return
    if (ch.leavingOffice) return // already leaving
    if (ch.matrixEffect === 'despawn') return // already despawning
    // Free seat and clear selection immediately
    if (ch.seatId) {
      const seat = this.seats.get(ch.seatId)
      if (seat) seat.assigned = false
      ch.seatId = null
    }
    if (this.selectedAgentId === id) this.selectedAgentId = null
    if (this.cameraFollowId === id) this.cameraFollowId = null
    this.agentRoles.delete(id)
    // Walk to entrance and despawn there
    this.startLeaveOffice(ch)
  }

  /** Find seat uid at a given tile position, or null */
  getSeatAtTile(col: number, row: number): string | null {
    for (const [uid, seat] of this.seats) {
      if (seat.seatCol === col && seat.seatRow === row) return uid
    }
    return null
  }

  /** Reassign an agent from their current seat to a new seat */
  reassignSeat(agentId: number, seatId: string): void {
    const ch = this.characters.get(agentId)
    if (!ch) return
    // Check if target seat is already taken by another character
    if (this.isSeatClaimed(seatId, agentId)) return
    // Unassign old seat
    if (ch.seatId) {
      const old = this.seats.get(ch.seatId)
      if (old) old.assigned = false
    }
    // Assign new seat
    const seat = this.seats.get(seatId)
    if (!seat || seat.assigned) return
    seat.assigned = true
    ch.seatId = seatId
    // Pathfind to new seat (unblock own seat tile for this query)
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, this.tileMap, this.blockedTiles)
    )
    if (path.length > 0) {
      ch.path = path
      ch.moveProgress = 0
      ch.state = CharacterState.WALK
      ch.frame = 0
      ch.frameTimer = 0
    } else {
      // Already at seat or no path — sit down
      ch.state = CharacterState.TYPE
      ch.dir = seat.facingDir
      ch.frame = 0
      ch.frameTimer = 0
      if (!ch.isActive) {
        ch.seatTimer = INACTIVE_SEAT_TIMER_MIN_SEC + Math.random() * INACTIVE_SEAT_TIMER_RANGE_SEC
      }
    }
  }

  /** Send an agent back to their currently assigned seat */
  sendToSeat(agentId: number): void {
    const ch = this.characters.get(agentId)
    if (!ch || !ch.seatId) return
    const seat = this.seats.get(ch.seatId)
    if (!seat) return
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, this.tileMap, this.blockedTiles)
    )
    if (path.length > 0) {
      ch.path = path
      ch.moveProgress = 0
      ch.state = CharacterState.WALK
      ch.frame = 0
      ch.frameTimer = 0
    } else {
      // Already at seat — sit down
      ch.state = CharacterState.TYPE
      ch.dir = seat.facingDir
      ch.frame = 0
      ch.frameTimer = 0
      if (!ch.isActive) {
        ch.seatTimer = INACTIVE_SEAT_TIMER_MIN_SEC + Math.random() * INACTIVE_SEAT_TIMER_RANGE_SEC
      }
    }
  }

  /** Walk an agent to an arbitrary walkable tile (right-click command) */
  walkToTile(agentId: number, col: number, row: number): boolean {
    const ch = this.characters.get(agentId)
    if (!ch || ch.isSubagent) return false
    if (!isWalkable(col, row, this.tileMap, this.blockedTiles)) {
      // Also allow walking to own seat tile (blocked for others but not self)
      const key = this.ownSeatKey(ch)
      if (!key || key !== `${col},${row}`) return false
    }
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, col, row, this.tileMap, this.blockedTiles)
    )
    if (path.length === 0) return false
    ch.path = path
    ch.moveProgress = 0
    ch.state = CharacterState.WALK
    ch.frame = 0
    ch.frameTimer = 0
    return true
  }

  /** Create a sub-agent character with the parent's palette. Returns the sub-agent ID.
   *  Seat priority: desk-facing near parent > non-lounge near parent > lounge near parent.
   *  Avoids clustering by preferring tiles not adjacent to existing subagents. */
  addSubagent(parentAgentId: number, parentToolId: string): number {
    const key = `${parentAgentId}:${parentToolId}`
    if (this.subagentIdMap.has(key)) return this.subagentIdMap.get(key)!

    const id = this.nextSubagentId--
    const parentCh = this.characters.get(parentAgentId)
    const palette = parentCh ? parentCh.palette : 0
    const hueShift = parentCh ? parentCh.hueShift : 0

    // Cluster-aware seat scoring: find seat closest to team cluster
    // Use parent's seat position (stable) instead of current tile (may be wandering)
    const parentSeat = parentCh?.seatId ? this.seats.get(parentCh.seatId) : null
    const parentCol = parentSeat ? parentSeat.seatCol : (parentCh ? parentCh.tileCol : 0)
    const parentRow = parentSeat ? parentSeat.seatRow : (parentCh ? parentCh.tileRow : 0)
    const { chainRoot } = this.getAgentPriority(parentAgentId)
    const cluster = this.getClusterCentroid(chainRoot)
    const teammates = cluster.members.map(m => ({ col: m.col, row: m.row }))
    const priority = Math.min(this.getAgentPriority(parentAgentId).priority + 1, 4)

    const clusterScore = (seat: Seat) => this.scoreClusterSeat(
      seat, parentCol, parentRow, cluster.col, cluster.row, priority, teammates,
    )

    let bestSeatId: string | null = null
    let bestScore = Infinity

    // Priority 1: desk-facing non-lounge seats scored by cluster
    for (const [uid, seat] of this.seats) {
      if (seat.assigned || seat.isLounge || !seat.facesDesk || this.isSeatClaimed(uid)) continue
      if (!this.canSitInSeat(seat, id)) continue
      const s = clusterScore(seat)
      if (s < bestScore) { bestScore = s; bestSeatId = uid }
    }
    // Priority 2: any non-lounge seats
    if (!bestSeatId) {
      bestScore = Infinity
      for (const [uid, seat] of this.seats) {
        if (seat.assigned || seat.isLounge || this.isSeatClaimed(uid)) continue
        if (!this.canSitInSeat(seat, id)) continue
        const s = clusterScore(seat)
        if (s < bestScore) { bestScore = s; bestSeatId = uid }
      }
    }
    // Priority 3: allow lounge seats
    if (!bestSeatId) {
      bestScore = Infinity
      for (const [uid, seat] of this.seats) {
        if (seat.assigned || this.isSeatClaimed(uid)) continue
        const s = clusterScore(seat)
        if (s < bestScore) { bestScore = s; bestSeatId = uid }
      }
    }

    let ch: Character
    if (bestSeatId && this.claimSeat(bestSeatId)) {
      const seat = this.seats.get(bestSeatId)!
      ch = createCharacter(id, palette, bestSeatId, seat, hueShift)
    } else {
      // No seats — spawn at closest walkable tile to cluster
      let spawn = { col: 1, row: 1 }
      if (this.walkableTiles.length > 0) {
        let closest = this.walkableTiles[0]
        let closestScore = Infinity
        for (const t of this.walkableTiles) {
          const dParent = Math.abs(t.col - parentCol) + Math.abs(t.row - parentRow)
          const dCentroid = Math.abs(t.col - cluster.col) + Math.abs(t.row - cluster.row)
          const s = dParent + dCentroid
          if (s < closestScore) { closest = t; closestScore = s }
        }
        spawn = closest
      }
      ch = createCharacter(id, palette, null, null, hueShift)
      ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2
      ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2
      ch.tileCol = spawn.col
      ch.tileRow = spawn.row
    }
    ch.isSubagent = true
    ch.parentAgentId = parentAgentId
    // Enter through the office door: spawn at entrance and walk to seat
    const targetCol = ch.tileCol
    const targetRow = ch.tileRow
    ch.x = ENTRANCE_COL * TILE_SIZE + TILE_SIZE / 2
    ch.y = ENTRANCE_ROW * TILE_SIZE + TILE_SIZE / 2
    ch.tileCol = ENTRANCE_COL
    ch.tileRow = ENTRANCE_ROW
    const entrancePath = this.buildPathFromEntrance(targetCol, targetRow)
    if (entrancePath.length > 0) {
      ch.path = entrancePath
      ch.moveProgress = 0
      ch.state = CharacterState.WALK
      ch.frame = 0
      ch.frameTimer = 0
    } else {
      // No path from entrance — fall back to matrix spawn at seat
      ch.x = targetCol * TILE_SIZE + TILE_SIZE / 2
      ch.y = targetRow * TILE_SIZE + TILE_SIZE / 2
      ch.tileCol = targetCol
      ch.tileRow = targetRow
      ch.matrixEffect = 'spawn'
      ch.matrixEffectTimer = 0
      ch.matrixEffectSeeds = matrixEffectSeeds()
    }
    this.characters.set(id, ch)

    this.subagentIdMap.set(key, id)
    this.subagentMeta.set(id, { parentAgentId, parentToolId })
    return id
  }

  /** Remove a specific sub-agent character and free its seat */
  removeSubagent(parentAgentId: number, parentToolId: string): void {
    const key = `${parentAgentId}:${parentToolId}`
    const id = this.subagentIdMap.get(key)
    if (id === undefined) return

    const ch = this.characters.get(id)
    if (ch) {
      if (ch.leavingOffice || ch.matrixEffect === 'despawn') {
        // Already leaving/despawning — just clean up maps
        this.subagentIdMap.delete(key)
        this.subagentMeta.delete(id)
        return
      }
      if (ch.seatId) {
        const seat = this.seats.get(ch.seatId)
        if (seat) seat.assigned = false
        ch.seatId = null
      }
      // Walk to entrance and despawn there
      this.startLeaveOffice(ch)
    }
    // Clean up tracking maps immediately so keys don't collide
    this.subagentIdMap.delete(key)
    this.subagentMeta.delete(id)
    if (this.selectedAgentId === id) this.selectedAgentId = null
    if (this.cameraFollowId === id) this.cameraFollowId = null
  }

  /** Remove all sub-agents belonging to a parent agent */
  removeAllSubagents(parentAgentId: number): void {
    const toRemove: string[] = []
    for (const [key, id] of this.subagentIdMap) {
      const meta = this.subagentMeta.get(id)
      if (meta && meta.parentAgentId === parentAgentId) {
        const ch = this.characters.get(id)
        if (ch) {
          if (ch.leavingOffice || ch.matrixEffect === 'despawn') {
            // Already leaving/despawning — just clean up maps
            this.subagentMeta.delete(id)
            toRemove.push(key)
            continue
          }
          if (ch.seatId) {
            const seat = this.seats.get(ch.seatId)
            if (seat) seat.assigned = false
            ch.seatId = null
          }
          // Walk to entrance and despawn there
          this.startLeaveOffice(ch)
        }
        this.subagentMeta.delete(id)
        if (this.selectedAgentId === id) this.selectedAgentId = null
        if (this.cameraFollowId === id) this.cameraFollowId = null
        toRemove.push(key)
      }
    }
    for (const key of toRemove) {
      this.subagentIdMap.delete(key)
    }
  }

  /** Look up the sub-agent character ID for a given parent+toolId, or null */
  getSubagentId(parentAgentId: number, parentToolId: string): number | null {
    return this.subagentIdMap.get(`${parentAgentId}:${parentToolId}`) ?? null
  }

  setAgentActive(id: number, active: boolean): void {
    const ch = this.characters.get(id)
    if (!ch) return
    ch.isActive = active
    if (!active) {
      // Sentinel -1: signals turn just ended, skip next seat rest timer.
      // In TYPE state, seatTimer <= 0 triggers immediate IDLE transition.
      ch.seatTimer = -1
      ch.path = []
      ch.moveProgress = 0
    } else {
      // Cancel sofa walk — active agent should head back to desk
      if (ch.loungeTargetSeatId) {
        ch.loungeTargetSeatId = null
        ch.path = []
        ch.moveProgress = 0
      }
      // Ensure boss/lead agents return to role-restricted seat closest to team cluster
      const role = this.agentRoles.get(id)
      if (role && ch.seatId) {
        const currentSeat = this.seats.get(ch.seatId)
        // If current seat is NOT role-restricted but one is available, switch
        if (!currentSeat?.requiredRoles || !currentSeat.requiredRoles.includes(role)) {
          const cluster = this.getClusterCentroid(this.getAgentPriority(id).chainRoot)
          let bestUid: string | null = null
          let bestDist = Infinity
          for (const [uid, seat] of this.seats) {
            if (!seat.requiredRoles || !seat.requiredRoles.includes(role)) continue
            if (seat.assigned || this.isSeatClaimed(uid)) continue
            const d = Math.abs(seat.seatCol - cluster.col) + Math.abs(seat.seatRow - cluster.row)
            if (d < bestDist) { bestDist = d; bestUid = uid }
          }
          if (bestUid) {
            // Vacate old seat
            if (currentSeat) currentSeat.assigned = false
            ch.seatId = null
            // Claim role seat closest to team
            if (this.claimSeat(bestUid)) {
              ch.seatId = bestUid
            }
          }
        }
      }
    }
    this.rebuildFurnitureInstances()
  }

  /** Rebuild furniture instances with auto-state applied (active agents turn electronics ON) */
  private rebuildFurnitureInstances(): void {
    // Collect tiles where active agents face desks
    const autoOnTiles = new Set<string>()
    for (const ch of this.characters.values()) {
      if (!ch.isActive || !ch.seatId) continue
      const seat = this.seats.get(ch.seatId)
      if (!seat) continue
      // Find the desk tile(s) the agent faces from their seat
      const dCol = seat.facingDir === Direction.RIGHT ? 1 : seat.facingDir === Direction.LEFT ? -1 : 0
      const dRow = seat.facingDir === Direction.DOWN ? 1 : seat.facingDir === Direction.UP ? -1 : 0
      // Check tiles in the facing direction (desk could be 1-3 tiles deep)
      for (let d = 1; d <= AUTO_ON_FACING_DEPTH; d++) {
        const tileCol = seat.seatCol + dCol * d
        const tileRow = seat.seatRow + dRow * d
        autoOnTiles.add(`${tileCol},${tileRow}`)
      }
      // Also check tiles to the sides of the facing direction (desks can be wide)
      for (let d = 1; d <= AUTO_ON_SIDE_DEPTH; d++) {
        const baseCol = seat.seatCol + dCol * d
        const baseRow = seat.seatRow + dRow * d
        if (dCol !== 0) {
          // Facing left/right: check tiles above and below
          autoOnTiles.add(`${baseCol},${baseRow - 1}`)
          autoOnTiles.add(`${baseCol},${baseRow + 1}`)
        } else {
          // Facing up/down: check tiles left and right
          autoOnTiles.add(`${baseCol - 1},${baseRow}`)
          autoOnTiles.add(`${baseCol + 1},${baseRow}`)
        }
      }
    }

    // Build modified furniture list with auto-state and animation applied
    const animFrame = Math.floor(this.furnitureAnimTimer / FURNITURE_ANIM_INTERVAL_SEC)
    const hasAutoOn = autoOnTiles.size > 0
    const modifiedFurniture: PlacedFurniture[] = this.layout.furniture.map((item) => {
      const entry = getCatalogEntry(item.type)
      if (!entry) return item

      // Always-on animations: items with animation frames but no state toggle (e.g. fireplaces)
      const frames = getAnimationFrames(item.type)
      if (frames && frames.length > 1) {
        const toggled = getOnStateType(item.type)
        // If getOnStateType returns the same type, this is NOT a state-toggled item → always animate
        if (toggled === item.type) {
          const frameIdx = animFrame % frames.length
          return { ...item, type: frames[frameIdx] }
        }
      }

      // Auto-on: active agents turn electronics ON
      if (!hasAutoOn) return item
      for (let dr = 0; dr < entry.footprintH; dr++) {
        for (let dc = 0; dc < entry.footprintW; dc++) {
          if (autoOnTiles.has(`${item.col + dc},${item.row + dr}`)) {
            let onType = getOnStateType(item.type)
            if (onType !== item.type) {
              // Check if the on-state type has animation frames
              const onFrames = getAnimationFrames(onType)
              if (onFrames && onFrames.length > 1) {
                const frameIdx = animFrame % onFrames.length
                onType = onFrames[frameIdx]
              }
              return { ...item, type: onType }
            }
            return item
          }
        }
      }
      return item
    })

    this.furniture = layoutToFurnitureInstances(modifiedFurniture)
  }

  setAgentTool(id: number, tool: string | null): void {
    const ch = this.characters.get(id)
    if (ch) {
      ch.currentTool = tool
    }
  }

  showPermissionBubble(id: number): void {
    const ch = this.characters.get(id)
    if (ch) {
      ch.bubbleType = 'permission'
      ch.bubbleTimer = 0
    }
  }

  clearPermissionBubble(id: number): void {
    const ch = this.characters.get(id)
    if (ch && ch.bubbleType === 'permission') {
      ch.bubbleType = null
      ch.bubbleTimer = 0
    }
  }

  showActivityBubble(id: number, text: string): void {
    const ch = this.characters.get(id)
    if (!ch) return
    // Don't override permission bubbles
    if (ch.bubbleType === 'permission') return
    const short = text.length > ACTIVITY_BUBBLE_MAX_CHARS
      ? text.slice(0, ACTIVITY_BUBBLE_MAX_CHARS) + '\u2026'
      : text
    ch.bubbleType = 'activity'
    ch.bubbleText = short
    ch.bubbleTimer = ACTIVITY_BUBBLE_DURATION_SEC
  }

  showWaitingBubble(id: number): void {
    const ch = this.characters.get(id)
    if (ch) {
      ch.bubbleType = 'waiting'
      ch.bubbleTimer = WAITING_BUBBLE_DURATION_SEC
    }
  }

  /** Dismiss bubble on click — permission: instant, waiting/activity: quick fade */
  dismissBubble(id: number): void {
    const ch = this.characters.get(id)
    if (!ch || !ch.bubbleType) return
    if (ch.bubbleType === 'permission') {
      ch.bubbleType = null
      ch.bubbleTimer = 0
    } else if (ch.bubbleType === 'waiting' || ch.bubbleType === 'activity') {
      ch.bubbleTimer = Math.min(ch.bubbleTimer, DISMISS_BUBBLE_FAST_FADE_SEC)
    }
  }

  update(dt: number): void {
    // ── Seat invariant repair: 1 seat = 1 character ──────────────────
    // Detect and fix any double-seated agents (defensive sweep)
    const seatOwners = new Map<string, number>()
    for (const ch of this.characters.values()) {
      if (!ch.seatId || ch.matrixEffect === 'despawn') continue
      const existing = seatOwners.get(ch.seatId)
      if (existing !== undefined) {
        // Conflict: two live characters claim the same seat — evict the later one
        ch.seatId = null
        ch.state = CharacterState.IDLE
        ch.wanderTimer = 0
      } else {
        seatOwners.set(ch.seatId, ch.id)
      }
    }
    // Sync seat.assigned flags with actual ownership
    for (const [uid, seat] of this.seats) {
      const shouldBeAssigned = seatOwners.has(uid)
      if (seat.assigned !== shouldBeAssigned) {
        seat.assigned = shouldBeAssigned
      }
    }

    // Furniture animation cycling
    const prevFrame = Math.floor(this.furnitureAnimTimer / FURNITURE_ANIM_INTERVAL_SEC)
    this.furnitureAnimTimer += dt
    const newFrame = Math.floor(this.furnitureAnimTimer / FURNITURE_ANIM_INTERVAL_SEC)
    if (newFrame !== prevFrame) {
      this.rebuildFurnitureInstances()
    }

    const toDelete: number[] = []
    for (const ch of this.characters.values()) {
      // Handle matrix effect animation
      if (ch.matrixEffect) {
        ch.matrixEffectTimer += dt
        if (ch.matrixEffectTimer >= MATRIX_EFFECT_DURATION) {
          if (ch.matrixEffect === 'spawn') {
            // Spawn complete — clear effect, resume normal FSM
            ch.matrixEffect = null
            ch.matrixEffectTimer = 0
            ch.matrixEffectSeeds = []
          } else {
            // Despawn complete — mark for deletion
            toDelete.push(ch.id)
          }
        }
        continue // skip normal FSM while effect is active
      }

      if (!ch.isActive) {
        // Idle agents: use empty blockedTiles so they can walk through furniture to reach sofas
        // (they need to step off their desk/chair area which is surrounded by blocked desk tiles)
        updateCharacter(ch, dt, this.walkableTiles, this.seats, this.tileMap, this.idleBlockedTiles, this.characters)
      } else {
        // Active agents: normal furniture blocking, unblock own seat
        this.withOwnSeatUnblocked(ch, () =>
          updateCharacter(ch, dt, this.walkableTiles, this.seats, this.tileMap, this.blockedTiles, this.characters)
        )
      }
      // Expose state for debugging
      ;(globalThis as any).__pixelAgentsOS = this;

      // Tick bubble timer for waiting / activity bubbles
      if (ch.bubbleType === 'waiting' || ch.bubbleType === 'activity') {
        ch.bubbleTimer -= dt
        if (ch.bubbleTimer <= 0) {
          ch.bubbleType = null
          ch.bubbleTimer = 0
          ch.bubbleText = ''
        }
      }
    }
    // Check for characters that arrived at the entrance — start despawn effect
    for (const ch of this.characters.values()) {
      if (ch.leavingOffice && ch.path.length === 0 && !ch.matrixEffect) {
        ch.matrixEffect = 'despawn'
        ch.matrixEffectTimer = 0
        ch.matrixEffectSeeds = matrixEffectSeeds()
      }
    }
    // Remove characters that finished despawn
    for (const id of toDelete) {
      this.characters.delete(id)
    }
  }

  getCharacters(): Character[] {
    return Array.from(this.characters.values())
  }

  /** Get character at pixel position (for hit testing). Returns id or null. */
  getCharacterAt(worldX: number, worldY: number): number | null {
    const chars = this.getCharacters().sort((a, b) => b.y - a.y)
    for (const ch of chars) {
      // Skip characters that are leaving or despawning
      if (ch.leavingOffice || ch.matrixEffect === 'despawn') continue
      // Character sprite is 16x24, anchored bottom-center
      // Apply sitting offset to match visual position
      const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0
      const anchorY = ch.y + sittingOffset
      const left = ch.x - CHARACTER_HIT_HALF_WIDTH
      const right = ch.x + CHARACTER_HIT_HALF_WIDTH
      const top = anchorY - CHARACTER_HIT_HEIGHT
      const bottom = anchorY
      if (worldX >= left && worldX <= right && worldY >= top && worldY <= bottom) {
        return ch.id
      }
    }
    return null
  }
}
