// Explicit lucide map for the icon names used in data/creativeTaxonomy.ts (keeps the bundle lean:
// importing lucide's full `icons` object would pull every icon in).
import {
  ArrowLeftRight, AudioLines, Baby, BadgePercent, CircleAlert, CircleHelp, CirclePlay, Clapperboard, Eye, Flame, Flower2,
  Frown, GalleryHorizontal, GalleryVerticalEnd, Gift, Hand, HeartPulse, Hourglass, Image, Layers, Lightbulb, ListChecks,
  Magnet, MessageCircleHeart, MessageSquareQuote, MousePointerClick, Package, PackageOpen, PawPrint, Percent, PiggyBank,
  Quote, Scale, Scissors, Search, ShoppingBag, Sparkles, SquareSplitHorizontal, Star, Swords, Timer, TrendingDown,
  UserRound, Users, Zap, type LucideIcon,
} from 'lucide-react'

const MAP: Record<string, LucideIcon> = {
  AlertCircle: CircleAlert, CircleAlert, ArrowLeftRight, AudioLines, Baby, BadgePercent, Clapperboard, Eye, Flame, Flower2, Frown,
  GalleryHorizontal, GalleryVerticalEnd, Gift, Hand, HeartPulse, HelpCircle: CircleHelp, CircleHelp, Hourglass, Image, Layers,
  Lightbulb, ListChecks, Magnet, MessageCircleHeart, MessageSquareQuote, MousePointerClick, Package, PackageOpen, PawPrint,
  Percent, PiggyBank, PlayCircle: CirclePlay, CirclePlay, Quote, Scale, Scissors, Search, ShoppingBag, Sparkles,
  SplitSquareHorizontal: SquareSplitHorizontal, SquareSplitHorizontal, Star, Swords, Timer, TrendingDown, UserRound, Users, Zap,
}

export function TaxIcon({ name, size = 18, strokeWidth = 2 }: { name: string; size?: number; strokeWidth?: number }) {
  const I = MAP[name] ?? Sparkles
  return <I size={size} strokeWidth={strokeWidth} aria-hidden />
}
