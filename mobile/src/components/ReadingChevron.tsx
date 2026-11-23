import { ChevronLeft, ChevronRight, type LucideProps } from 'lucide-react-native'
import { mirroredInRtl, useMobileUiDirection } from '../i18n/ui-direction'

// Back and "opens a page" chevrons for screens that follow Arabic right to left: they point the
// way the row reads, so Back points right and the row chevron points left in Arabic.
export function BackChevron(props: LucideProps) {
  return <ChevronLeft {...props} style={[props.style, mirroredInRtl(useMobileUiDirection())]} />
}

export function ForwardChevron(props: LucideProps) {
  return <ChevronRight {...props} style={[props.style, mirroredInRtl(useMobileUiDirection())]} />
}
