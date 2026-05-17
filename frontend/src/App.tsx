import { Navigate, Route, Routes } from 'react-router-dom';
import BlogLayout from '@/pages/blog/BlogLayout';
import BlogHome from '@/pages/blog/BlogHome';
import KBPostsPage from '@/pages/blog/KBPostsPage';
import PostDetail from '@/pages/blog/PostDetail';
import ArchivePage from '@/pages/blog/ArchivePage';
import TagCloudPage from '@/pages/blog/TagCloudPage';
import LoginPage from '@/pages/admin/LoginPage';
import RequireAuth from '@/pages/admin/RequireAuth';
import AdminLayout from '@/pages/admin/AdminLayout';
import KBListPage from '@/pages/admin/KBListPage';
import KBWorkspace from '@/pages/admin/KBWorkspace';
import DocEditorPage from '@/pages/admin/DocEditorPage';
import ExportsPage from '@/pages/admin/ExportsPage';
import UsersPage from '@/pages/admin/UsersPage';
import DocLinkResolver from '@/pages/DocLinkResolver';
import StarryNight from '@/components/common/StarryNight';
import DeepSea from '@/components/common/DeepSea';
import 'tippy.js/dist/tippy.css';
import './styles/theme.css';
import './styles/markdown.css';
import './styles/tiptap.css';
import './styles/diff.css';
import './styles/paper.css';
import './styles/book-card.css';
import './styles/archive-tagcloud.css';
import './styles/reader.css';
import './styles/starry.css';
import './styles/deepsea.css';
import './styles/responsive.css';

export default function App() {
  return (
    <>
      <StarryNight />
      <DeepSea />
      <Routes>
      <Route element={<BlogLayout />}>
        <Route path="/" element={<BlogHome />} />
        <Route path="/kb/:slug" element={<KBPostsPage />} />
        <Route path="/posts/:slug" element={<PostDetail />} />
        <Route path="/archive" element={<ArchivePage />} />
        <Route path="/tags" element={<TagCloudPage />} />
      </Route>

      <Route path="/d/:id" element={<DocLinkResolver />} />

      <Route path="/admin/login" element={<LoginPage />} />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="kbs" replace />} />
        <Route path="kbs" element={<KBListPage />} />
        <Route path="kbs/:id" element={<KBWorkspace />} />
        <Route path="kbs/:id/docs/:docId" element={<DocEditorPage />} />
        <Route path="exports" element={<ExportsPage />} />
        <Route path="users" element={<UsersPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
