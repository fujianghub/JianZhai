import BlogKbNavPanel from './BlogKbNavPanel';

interface Props {
  kbSlug: string;
  currentSlug?: string;
  onClose?: () => void;
}

/** Post-detail left rail — thin wrapper around {@link BlogKbNavPanel}. */
export default function KbNavSidebar(props: Props) {
  return <BlogKbNavPanel {...props} />;
}
