// Common kit (class prefix kx-): small building blocks used by every site.
export { ImageWithFallback, type ImageWithFallbackProps } from './ImageWithFallback'
export { Money, type MoneyProps } from './Money'
export { Stars, type StarsProps } from './Stars'
export { Countdown, formatCountdown, type CountdownProps } from './Countdown'
export { EmptyArt, type EmptyArtKind, type EmptyArtProps } from './EmptyArt'
export { Floating, Portal, type FloatingPlacement, type FloatingProps } from './Floating'
export { RangeCalendar, type RangeCalendarProps } from './RangeCalendar'
export { useControllableState, useLayer, useInterval, useHover, useElementWidth, kitLayerOpen } from './hooks'
export { cx, hashString, tileColor, initials, formatSocialCount, clamp, TILE_PALETTE } from './utils'
export {
  SHOP_PRESETS, ADS_PRESETS, resolvePreset, presetValue, useDateRangeState, formatRange, presetLabel, monthGrid, ymOf,
  monthTitle, addMonths, parseDayInput, comparisonRange, WEEKDAY_INITIALS,
  type DateRange, type DateRangeValue, type DatePresetId, type ShopPresetId, type AdsPresetId, type PresetDef, type MonthCell,
  type ComparisonMode,
} from './dates'
export { renderIcon, type IconSource, type IconComponentProps } from './icon'
