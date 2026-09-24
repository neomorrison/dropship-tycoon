// Charts kit (class prefix kc-) — recharts wrappers in the Shopify analytics style.
export {
  CHART_COLORS, SERIES_COLORS, formatValue, formatAxis, percentChange, ChartTip, LegendItem,
  type ChartFormat, type TipRow,
} from './shared'
export {
  LineChartCard, TrendChart, DeltaBadge,
  type LineChartCardProps, type LineChartPoint, type TrendChartProps, type TrendSeries,
} from './LineCharts'
export { Sparkline, GaugeRing, type SparklineProps, type GaugeRingProps } from './small'
export { BarChart, type BarChartProps, type BarDatum } from './BarChart'
export { DonutChart, FunnelBars, type DonutChartProps, type DonutDatum, type FunnelBarsProps, type FunnelStep } from './DonutChart'
