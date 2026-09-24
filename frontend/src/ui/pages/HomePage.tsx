import { Features } from '@components/Features';
import { Footer } from '@components/Footer';
import { Hero } from '@components/Hero';
import { Navbar } from '@components/Navbar';
import { OfflineFirst } from '@components/OfflineFirst';
import { WhySection } from '@components/WhySection';

export function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Features />
        <OfflineFirst />
        <WhySection />
      </main>
      <Footer />
    </>
  );
}
