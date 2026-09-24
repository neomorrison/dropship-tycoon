// Ads Manager kit (class prefix am-) — shared by Fadbook (theme 'fadbook') and TikTak (theme 'tiktak').
// Wrap the site in <AmThemeProvider theme="…">. See src/ui/kit/README.md for every component.
export { AmThemeProvider, AmThemeScope, useAmTheme, amThemeClass, type AmTheme, type AmThemeProviderProps } from './theme'
export {
  AmSpinner, AmButton, AmButtonGroup, Toggle, AmCheckbox, AmRadio, AmRadioCard, AmField, AmInput, AmSearch, AmSelect, AmTag, AmNotice,
  AmCard, AmSegmented, AmTooltip, InfoTip,
  type AmButtonProps, type ToggleProps, type AmCheckboxProps, type AmRadioProps, type AmRadioCardProps, type AmFieldProps,
  type AmInputProps, type AmOption, type AmSelectProps, type AmTagTone, type AmNoticeProps, type AmCardProps, type AmSegmentedProps,
  type AmTooltipProps,
} from './controls'
export {
  AmMenu, AmModal, SideDrawer,
  type AmMenuItem, type AmMenuSection, type AmMenuProps, type AmModalProps, type SideDrawerProps,
} from './overlays'
export {
  AmTable, AmNameCell, amSortRows,
  type AmTableProps, type AmColumn, type AmRowAction, type AmSort, type AmSortDirection, type AmNameCellProps,
} from './AmTable'
export {
  StatusCell, MetricCell, BudgetCell, amFmt, deliveryTone, checkBudgetEdit, minDailyBudget, learningResetThreshold,
  type StatusCellProps, type DeliveryTone, type MetricCellProps, type BudgetCellProps,
} from './cells'
export {
  AmDateRangePicker, ColumnsMenu, BreakdownMenu, DEFAULT_BREAKDOWNS,
  type AmDateRangePickerProps, type AmColumnDef, type AmColumnPreset, type ColumnsValue, type ColumnsMenuProps,
  type BreakdownOption, type BreakdownSection, type BreakdownMenuProps,
} from './pickers'
/** Alias so sites can write `import { DateRangePicker } from '…/adsmanager'`. */
export { AmDateRangePicker as DateRangePicker } from './pickers'
export {
  Stepper, EntityTabs, AudienceGauge, audiencePosition, entityTabLabels,
  type StepDef, type StepStatus, type StepperProps, type EntityTabDef, type EntityTabsProps, type EntityLevel, type AudienceGaugeProps,
} from './nav'
/** Alias for the task's naming ("Tabs" = Campaigns / Ad sets / Ads). */
export { EntityTabs as Tabs } from './nav'
/** Alias: the Ads Manager tooltip. */
export { AmTooltip as Tooltip } from './controls'
