import { Vector3 } from 'three'
import type { Card } from '@/cards/Card'
import type { BoardState } from '@/state/BoardState'
import { ATK, type LandingFx } from './LandingFx'
import { easeOutCubic, type Tweens } from './Tweens'

const easeInQuart = (t: number) => t * t * t * t

/** Where a direct attack lands: the middle of the opponent's monster row. */
const DIRECT_Z = -1.95

/** Visual-only battle: the attacker lunges into the target and comes back. No outcome is applied. */
export class AttackFx {
  private running = new Set<Card>()

  private readonly tweens: Tweens
  private readonly board: BoardState
  private readonly landing: LandingFx

  constructor(tweens: Tweens, board: BoardState, landing: LandingFx) {
    this.tweens = tweens
    this.board = board
    this.landing = landing
  }

  /** `target` null is a direct attack. */
  attack(attacker: Card, target: Card | null) {
    if (this.running.has(attacker)) return
    const home = this.board.hold(attacker)
    if (!home) return
    const struck = target ? this.board.hold(target) : null
    this.running.add(attacker)

    const aim = struck ? struck.position.clone() : new Vector3(home.position.x * 0.4, home.position.y, DIRECT_Z)
    const dir = aim.clone().sub(home.position).setY(0)
    const dist = dir.length()
    dir.normalize()

    const windup = home.position.clone().addScaledVector(dir, -0.35)
    windup.y += 0.55
    const hit = home.position.clone().addScaledVector(dir, Math.max(0, dist - (struck ? 0.55 : 0)))
    hit.y = aim.y + (struck ? 0.18 : 0.05)
    const quat = home.quaternion.clone()

    this.tweens.animate(attacker.mesh, { position: windup, quaternion: quat }, 0.2, {
      ease: easeOutCubic,
      onDone: () => {
        this.tweens.animate(attacker.mesh, { position: hit, quaternion: quat }, 0.14, {
          ease: easeInQuart,
          onDone: () => {
            this.landing.shockwave(aim, ATK, true)
            if (target && struck) this.recoil(target, struck.position, dir)
            this.tweens.animate(attacker.mesh, { position: home.position, quaternion: quat }, 0.38, {
              delay: 0.06,
              ease: easeOutCubic,
              onDone: () => {
                this.running.delete(attacker)
                this.board.letGo(attacker)
              },
            })
          },
        })
      },
    })
  }

  /** The struck card gets knocked back a little and settles. */
  private recoil(card: Card, rest: Vector3, dir: Vector3) {
    const knocked = rest.clone().addScaledVector(dir, 0.22)
    knocked.y += 0.06
    this.tweens.animate(card.mesh, { position: knocked }, 0.06, {
      onDone: () => {
        this.tweens.animate(card.mesh, { position: rest }, 0.3, {
          ease: easeOutCubic,
          onDone: () => this.board.letGo(card),
        })
      },
    })
  }
}
