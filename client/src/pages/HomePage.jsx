import BannerSlider from "../components/BannerSlider";
import Article from "../components/Article/Article";
import ConsultancySection from "../components/consultancy/ConsultancySection.jsx";
import NewsTicker from "../components/NewsTicker.jsx";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#f8fafc]">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Hero / Banner */}
        <BannerSlider />

        {/* News ticker (horizontal, just below banner) */}
        <NewsTicker />

        {/* Title + Description */}
        <h1 className="text-3xl font-bold mt-6 text-center">
          Welcome to Law Network
        </h1>
        <p className="text-gray-700 text-center mt-2">
          Select a section from the navigation above.
        </p>

        {/* ===== 70 / 30 split with ZERO horizontal gap ===== */}
        <section className="mt-10 grid grid-cols-1 md:grid-cols-[7fr_3fr] gap-0 items-start">
          {/* Left: Articles (70%). Hide internal admin compose ONLY on the homepage. */}
          <div
            className="
              [&_section#articles]:max-w-none
              [&_section#articles]:px-0
              [&_section#articles]:py-0
              [&_section#articles>div:nth-child(2)]:hidden
            "
          >
            <h2 className="text-2xl font-semibold mb-4">Latest Articles</h2>
            <Article limit={3} />
          </div>

          {/* Right: Consultancy (30%). Remove any default top margin inside. */}
          <aside className="[&_section]:mt-0">
            <ConsultancySection />
          </aside>
        </section>
      </div>
    </main>
  );
}
