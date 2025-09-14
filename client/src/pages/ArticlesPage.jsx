import Article from "../components/Article/Article";
import ConsultancySection from "../components/consultancy/ConsultancySection.jsx";

export default function ArticlesPage() {
  return (
    <main className="min-h-screen bg-[#f8fafc]">
      {/* 70/30 split, zero gap */}
      <section className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-10 gap-0">
        {/* Articles */}
        <div className="col-span-10 md:col-span-7 
                        [&_section#articles]:max-w-none 
                        [&_section#articles]:px-0 
                        [&_section#articles]:py-0 
                        md:pr-0">
          <Article />
        </div>

        {/* Consultancy */}
        <aside className="col-span-10 md:col-span-3 md:pl-0 [&_section]:mt-0">
          <ConsultancySection />
        </aside>
      </section>
    </main>
  );
}
