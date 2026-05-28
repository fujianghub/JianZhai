import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Spin } from 'antd';
import BlogLayout from '@/pages/blog/BlogLayout';
import BlogHome from '@/pages/blog/BlogHome';
import RequireAuth from '@/pages/admin/RequireAuth';
import LoginPage from '@/pages/admin/LoginPage';
import StarryNight from '@/components/common/StarryNight';
import DeepSea from '@/components/common/DeepSea';

// Code-split everything past the public landing + auth shell. This pulls the
// editor (Tiptap/KaTeX/lowlight), force-graph, pdfjs, mermaid, etc. out of the
// main chunk so first paint downloads far less JS.
const KBPostsPage = lazy(() => import('@/pages/blog/KBPostsPage'));
const PostDetail = lazy(() => import('@/pages/blog/PostDetail'));
const PostEditRoute = lazy(() => import('@/pages/blog/PostEditPage'));
const ArchivePage = lazy(() => import('@/pages/blog/ArchivePage'));
const TagCloudPage = lazy(() => import('@/pages/blog/TagCloudPage'));
const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout'));
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'));
const KBListPage = lazy(() => import('@/pages/admin/KBListPage'));
const KBWorkspace = lazy(() => import('@/pages/admin/KBWorkspace'));
const DocEditorPage = lazy(() => import('@/pages/admin/DocEditorPage'));
const ExportsPage = lazy(() => import('@/pages/admin/ExportsPage'));
const UsersPage = lazy(() => import('@/pages/admin/UsersPage'));
const SystemOverviewPage = lazy(() => import('@/pages/admin/SystemOverviewPage'));
const AIManagementPage = lazy(() => import('@/pages/admin/AIManagementPage'));
const KnowledgeGraphPage = lazy(() => import('@/pages/admin/KnowledgeGraphPage'));
const ProfilePage = lazy(() => import('@/pages/admin/ProfilePage'));
const FavoritesPage = lazy(() => import('@/pages/FavoritesPage'));
const TrashPage = lazy(() => import('@/pages/admin/TrashPage'));
const DocLinkResolver = lazy(() => import('@/pages/DocLinkResolver'));
import 'tippy.js/dist/tippy.css';
import './styles/theme.css';
import './styles/markdown.css';
import './styles/tiptap.css';
import './styles/editor-ui.css';
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
      <Suspense
        fallback={
          <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
            <Spin size="large" />
          </div>
        }
      >
      <Routes>
      <Route element={<BlogLayout />}>
        <Route path="/" element={<BlogHome />} />
        <Route path="/kb/:slug" element={<KBPostsPage />} />
        <Route path="/posts/:slug" element={<PostDetail />} />
        <Route path="/posts/:slug/edit" element={<PostEditRoute />} />
        <Route path="/archive" element={<ArchivePage />} />
        <Route path="/tags" element={<TagCloudPage />} />
        <Route
          path="/favorites"
          element={
            <RequireAuth>
              <FavoritesPage />
            </RequireAuth>
          }
        />
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
        <Route index element={<AdminDashboard />} />
        <Route path="kbs" element={<KBListPage />} />
        <Route path="kbs/:id" element={<KBWorkspace />} />
        <Route path="kbs/:id/docs/:docId" element={<DocEditorPage />} />
        <Route path="exports" element={<ExportsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="overview" element={<SystemOverviewPage />} />
        <Route path="ai" element={<AIManagementPage />} />
        <Route path="graph" element={<KnowledgeGraphPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="favorites" element={<FavoritesPage />} />
        <Route path="trash" element={<TrashPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </>
  );
}
