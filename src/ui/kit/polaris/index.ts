// Polaris kit (class prefix p-) — the Shopifly admin design system.
// Import from 'src/ui/kit/polaris'. See src/ui/kit/README.md for usage of every component.
export {
  PolarisProvider, Icon, Text, Link, BlockStack, InlineStack, InlineGrid, Box, Divider, FormLayout, Card, Layout,
  DescriptionList, Collapsible, Spinner, PlainActions,
  type PolarisProviderProps, type IconProps, type IconTone, type TextProps, type TextVariant, type TextTone, type LinkProps,
  type BlockStackProps, type InlineStackProps, type InlineGridProps, type BoxProps, type CardProps, type CardSectionProps,
  type LayoutSectionProps, type LayoutAnnotatedSectionProps, type DescriptionListProps, type CollapsibleProps,
} from './primitives'
export { Button, ButtonGroup, type ButtonProps, type ButtonGroupProps } from './Button'
export {
  Badge, Tag, Banner, Thumbnail, Avatar, ProgressBar, SkeletonBodyText, SkeletonDisplayText, SkeletonThumbnail, SkeletonTabs,
  SkeletonPage, EmptyState, DropZone, Pagination, InlineError,
  type BadgeProps, type BadgeTone, type BadgeProgress, type TagProps, type BannerProps, type BannerTone, type ThumbnailProps,
  type AvatarProps, type ProgressBarProps, type SkeletonPageProps, type EmptyStateProps, type DropZoneProps, type PaginationProps,
} from './display'
export {
  TextField, Select, Checkbox, RadioButton, ChoiceList, TagsInput,
  type TextFieldProps, type SelectProps, type SelectOption, type SelectGroup, type CheckboxProps, type RadioButtonProps,
  type ChoiceListProps, type ChoiceListChoice, type TagsInputProps,
} from './forms'
export {
  Modal, Popover, ActionList, Tooltip,
  type ModalProps, type ModalSectionProps, type PopoverProps, type ActionListProps, type ActionListItem, type ActionListSection,
  type TooltipProps,
} from './overlays'
export { Page, Tabs, ContextualSaveBar, type PageProps, type TabsProps, type TabDescriptor, type ContextualSaveBarProps } from './Page'
export {
  IndexTable, IndexFilters, DataTable, sortRows,
  type IndexTableProps, type IndexTableColumn, type IndexBulkAction, type IndexFiltersProps, type IndexSortOption,
  type DataTableProps, type SortDirection, type TableSort,
} from './IndexTable'
export { DateRangePicker, ComparisonPicker, type DateRangePickerProps, type ComparisonPickerProps, type ComparisonMode } from './DateRangePicker'
export { RichTextEditor, type RichTextEditorProps, type RteTool } from './RichTextEditor'
export {
  sanitizeRichText, richTextToPlain, richTextStats, plainToRichText, RICH_TEXT_TAGS, type RichTextStats,
} from './richText'
export { space, renderIcon, type SpaceToken, type IconSource, type IconComponentProps, type PAction } from './shared'
