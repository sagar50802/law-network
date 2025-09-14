// client/src/pages/AdminDashboard.jsx
import AdminBannerEditor from "../components/Admin/AdminBannerEditor";
import AdminArticleEditor from "../components/Admin/AdminArticleEditor";
import AdminPodcastEditor from "../components/Admin/AdminPodcastEditor";
import AdminVideoEditor from "../components/Admin/AdminVideoEditor";
import AdminPDFEditor from "../components/Admin/AdminPDFEditor";
import QREditor from "../components/Admin/QREditor";
import AdminSubmissions from "../components/Admin/AdminSubmissions";


export default function AdminDashboard() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-12">
      <h1 className="text-2xl font-semibold">Admin Dashboard</h1>

      <section>
        <h2 className="text-xl font-semibold mb-2">Manage Banners</h2>
        <AdminBannerEditor />
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">Manage Articles</h2>
        <AdminArticleEditor />
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">Manage Podcasts</h2>
        <AdminPodcastEditor />
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">Manage Videos</h2>
        <AdminVideoEditor />
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">PDF Notebook</h2>
        <AdminPDFEditor />
      </section>
      
      <section>
        <h2 className="text-xl font-semibold mb-2">QR & Plans</h2>
        <QREditor />                                           {/* ✅ add */}
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">User Submissions</h2>
        <AdminSubmissions />
      </section>
    </div>
  );
}
