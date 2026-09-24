// "Page grade" card for the product editor: score ring, conversion impact, and the
// grader's factors ordered by how much each could still add. How much detail the card
// reveals follows the player's Copywriting level (SPEC §3): tips for everyone, numeric
// factor scores from L3, more specific findings every two levels, trust readout at L4.
import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, CircleAlert, Lock, XCircle } from 'lucide-react'
import type { PageGrade, PageGradeFactor } from '../../../../core/types'
import { Badge, Banner, BlockStack, Card, Icon, InlineStack, Text, Tooltip } from '../../../kit/polaris'

export function gradeColor(score: number): string {
  if (score >= 80) return '#29845a'
  if (score >= 60) return '#b28400'
  if (score >= 45) return '#e07d10'
  return '#c70a24'
}
export function gradeLabel(score: number): string {
  if (score >= 85) return 'Excellent'
  if (score >= 70) return 'Good'
  if (score >= 50) return 'Needs work'
  return 'Poor'
}

export function ScoreRing({ score, size = 88, stroke = 8, label }: { score: number; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(100, score))
  const color = gradeColor(v)
  return (
    <div className="sf-mx-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ebebeb" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(v / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 0.4s ease, stroke 0.3s' }}
        />
      </svg>
      <div className="sf-mx-ring-text">
        <span className="sf-mx-ring-score" style={{ fontSize: size * 0.28 }}>{Math.round(v)}</span>
        {label && <span className="sf-mx-ring-label">{label}</span>}
      </div>
    </div>
  )
}

/** Findings revealed per factor at a copywriting level. */
export const detailsAllowed = (level: number) => (level >= 8 ? 99 : level >= 6 ? 3 : level >= 4 ? 2 : level >= 2 ? 1 : 0)

function statusOf(f: PageGradeFactor): 'good' | 'warn' | 'bad' {
  return f.status ?? (f.score >= 75 ? 'good' : f.score >= 45 ? 'warn' : 'bad')
}
const STATUS_ICON = { good: CheckCircle2, warn: CircleAlert, bad: XCircle }
const STATUS_TONE = { good: 'success', warn: 'caution', bad: 'critical' } as const
const STATUS_TEXT = { good: 'Good', warn: 'Needs work', bad: 'Poor' }

export interface GradeCardProps {
  grade: PageGrade
  /** grade stored at the last save (to show the unsaved delta) */
  savedScore: number | null
  dirty: boolean
  copyLevel: number
}

export function PageGradeCard({ grade, savedScore, dirty, copyLevel }: GradeCardProps) {
  const factors = [...grade.factors].sort((a, b) => b.weight * (100 - b.score) - a.weight * (100 - a.score))
  const [open, setOpen] = useState<string | null>(factors.find(f => f.score < 75)?.key ?? null)
  const showScores = copyLevel >= 3
  const showTrust = copyLevel >= 4
  const showImpact = copyLevel >= 5
  const nDetails = detailsAllowed(copyLevel)
  const delta = savedScore != null ? Math.round((grade.score - savedScore) * 10) / 10 : 0
  const cvrPct = Math.round((grade.cvrMult - 1) * 100)

  return (
    <Card
      title={
        <InlineStack gap="150" blockAlign="center">
          <span>Page grade</span>
          <Tooltip content="How well this product page is built to convert visitors into buyers, graded against proven e-commerce practices. Updates live as you edit." width="wide">
            <span className="sf-mx-help">?</span>
          </Tooltip>
        </InlineStack>
      }
      actions={dirty && Math.abs(delta) >= 0.1 ? <Badge tone={delta > 0 ? 'success' : 'critical'}>{`${delta > 0 ? '+' : ''}${delta} unsaved`}</Badge> : undefined}
    >
      <BlockStack gap="400">
        <InlineStack gap="400" blockAlign="center" wrap={false}>
          <ScoreRing score={grade.score} label="/ 100" />
          <BlockStack gap="100">
            <Text variant="headingMd" as="p" style={{ color: gradeColor(grade.score) }}>{gradeLabel(grade.score)}</Text>
            <Tooltip content="Estimated effect of this page on your conversion rate compared with an average store page. The same ad traffic buys more on a better page." width="wide" hasUnderline>
              <Text as="span" tone="subdued" variant="bodySm">
                Conversion impact {cvrPct >= 0 ? '+' : ''}{cvrPct}%
              </Text>
            </Tooltip>
            <Text as="p" tone="subdued" variant="bodySm">Mobile load time {grade.loadTime.toFixed(1)}s</Text>
            {showTrust && <Text as="p" tone="subdued" variant="bodySm">Shopper trust {Math.round(grade.trust * 100)}%</Text>}
          </BlockStack>
        </InlineStack>

        {grade.shippingLie && (
          <Banner tone="critical" inline title="Delivery promise is faster than reality">
            Customers will expect their order sooner than your supplier can deliver. Late orders turn into refunds and chargebacks.
          </Banner>
        )}
        {!grade.shippingLie && grade.honesty < 0.85 && (
          <Banner tone="warning" inline>Some claims on this page may not hold up. Shoppers who feel misled ask for refunds and dispute charges.</Banner>
        )}

        <div className="sf-mx-factors" role="list">
          {factors.map(f => {
            const st = statusOf(f)
            const I = STATUS_ICON[st]
            const isOpen = open === f.key
            const details = (f.details ?? []).slice(0, nDetails)
            const hidden = (f.details?.length ?? 0) - details.length
            return (
              <div key={f.key} className={`sf-mx-factor${isOpen ? ' is-open' : ''}`} role="listitem">
                <button type="button" className="sf-mx-factor-head" onClick={() => setOpen(isOpen ? null : f.key)} aria-expanded={isOpen}>
                  <Icon source={I} tone={STATUS_TONE[st]} size={18} />
                  <span className="sf-mx-factor-label">{f.label}</span>
                  {showImpact && f.weight >= 10 && <span className="sf-mx-impact">High impact</span>}
                  <span className="sf-mx-factor-score">
                    {showScores ? (
                      <>
                        <span className="sf-mx-minibar"><span style={{ width: `${f.score}%`, background: gradeColor(f.score) }} /></span>
                        <span className="sf-mx-scorenum">{f.score}</span>
                      </>
                    ) : (
                      <Text as="span" variant="bodySm" tone="subdued">{STATUS_TEXT[st]}</Text>
                    )}
                  </span>
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {isOpen && (
                  <div className="sf-mx-factor-body">
                    <Text as="p">{f.tip}</Text>
                    {details.length > 0 && (
                      <ul className="sf-mx-findings">
                        {details.map((d, i) => (
                          <li key={i}>
                            <AlertTriangle size={12} /> {d}
                          </li>
                        ))}
                      </ul>
                    )}
                    {hidden > 0 && (
                      <p className="sf-mx-locked">
                        <Lock size={12} /> {hidden} more finding{hidden === 1 ? '' : 's'} at a higher Copywriting level
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {copyLevel < 8 && (
          <Text as="p" tone="subdued" variant="bodySm">
            Copywriting Lv {copyLevel}: {copyLevel < 3 ? 'factor scores unlock at Lv 3.' : copyLevel < 4 ? 'trust readout unlocks at Lv 4.' : 'more detailed findings unlock as you level up.'}
          </Text>
        )}
      </BlockStack>
    </Card>
  )
}
