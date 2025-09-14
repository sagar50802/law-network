import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Navbar from "./components/layout/Navbar";
import AdminRoute from "./components/common/AdminRoute.jsx";

// static imports (pages)
import HomePage from "./pages/HomePage.jsx";
import ArticlesPage from "./pages/ArticlesPage.jsx";
import NewsPage from "./pages/NewsPage.jsx";
import VideosPage from "./pages/VideosPage.jsx";
import PodcastsPage from "./pages/PodcastsPage.jsx";
import NotebookPage from "./pages/NotebookPage.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import AdminLogin from "./pages/AdminLogin.jsx";

// admin editor for consultancy (component page)
import AdminConsultancyEditor from "./components/Admin/AdminConsultancyEditor.jsx";

// ✅ NEW: plagiarism page
import Plagiarism from "./pages/Plagiarism.jsx";

// ✅ NEW: Scholar Space page
import ScholarPage from "./pages/ScholarPage.jsx";

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <h1 className="text-6xl font-extrabold text-[#1e293b] mb-4">404</h1>
      <p className="text-lg text-gray-600 mb-6">
        Oops! The page you’re looking for doesn’t exist.
      </p>
      <a
        href="/"
        className="px-6 py-3 rounded-lg bg-[#0b1220] text-white shadow-lg hover:bg-[#1e293b] transition"
      >
        Go Back Home
      </a>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <div className="bg-gradient-to-br from-[#f8fafc] to-[#e6edf5] text-[#0b1220] min-h-screen font-inter antialiased">
        {/* Navbar with subtle glass effect */}
        <nav className="bg-white/70 backdrop-blur-md shadow-md sticky top-0 z-50">
          <Navbar />
        </nav>

        {/* Page transition wrapper */}
        <div className="animate-fadeIn">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/articles" element={<ArticlesPage />} />
            <Route path="/news" element={<NewsPage />} />
            <Route path="/videos" element={<VideosPage />} />
            <Route path="/podcasts" element={<PodcastsPage />} />
            <Route path="/notebook" element={<NotebookPage />} />
            {/* ✅ Scholar Space */}
            <Route path="/scholar" element={<ScholarPage />} />
            {/* ✅ NEW route */}
            <Route path="/plagiarism" element={<Plagiarism />} />

            {/* Admin */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route
              path="/admin/dashboard"
              element={
                <AdminRoute>
                  <AdminDashboard />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/consultancy"
              element={
                <AdminRoute>
                  <AdminConsultancyEditor />
                </AdminRoute>
              }
            />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}
