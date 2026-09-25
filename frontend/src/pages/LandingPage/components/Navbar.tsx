import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ArrowRight, Sparkles, LogIn } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface NavbarProps {
  onRequestDemo: () => void;
}

export function Navbar({ onRequestDemo }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: 'Home', href: '#hero' },
    { label: 'Features', href: '#features' },
    { label: 'Academics', href: '#academics' },
    { label: 'Finance', href: '#finance' },
    { label: 'Reports', href: '#reports' },
    { label: 'Pricing', href: '#pricing' },
  ];

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 px-4 sm:px-6 lg:px-8 ${
          scrolled ? 'pt-3' : 'pt-5'
        }`}
      >
        <div className="mx-auto max-w-7xl">
          <nav
            className={`flex items-center justify-between rounded-full px-5 py-2.5 transition-all duration-300 ${
              scrolled
                ? 'bg-[#10131D]/90 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/60'
                : 'bg-[#10131D]/60 backdrop-blur-md border border-white/5 shadow-lg'
            }`}
          >
            {/* Left: Official White Logo */}
            <a href="#hero" className="flex items-center gap-3 transition-opacity hover:opacity-90">
              <img
                src="/logo.png"
                alt="School Management System"
                className="h-7 sm:h-8 w-auto object-contain"
              />
            </a>

            {/* Center: Desktop Navigation Links */}
            <div className="hidden md:flex items-center gap-1 lg:gap-2">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="rounded-full px-3.5 py-1.5 text-xs lg:text-[13px] font-medium text-[#A7AEC1] transition-all hover:text-white hover:bg-white/5"
                >
                  {link.label}
                </a>
              ))}
            </div>

            {/* Right: Actions */}
            <div className="hidden sm:flex items-center gap-2 lg:gap-3">
              <Link to="/login">
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full px-3.5 text-xs font-semibold text-[#F7F8FC] hover:bg-white/10 hover:text-white"
                >
                  <LogIn className="mr-1.5 h-3.5 w-3.5" />
                  Login
                </Button>
              </Link>
              <Link to="/register">
                <Button
                  size="sm"
                  className="rounded-full bg-gradient-to-r from-[#4F46E5] via-[#6558F5] to-[#7467FF] px-4 py-1.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 hover:shadow-indigo-600/50 hover:opacity-95 transition-all"
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5 text-indigo-200" />
                  <span>Start Free Trial</span>
                </Button>
              </Link>
            </div>

            {/* Mobile Hamburger Toggle */}
            <div className="flex sm:hidden items-center gap-2">
              <Link to="/login">
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full px-3 text-xs text-[#F7F8FC]"
                >
                  Login
                </Button>
              </Link>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="rounded-full p-2 text-[#A7AEC1] hover:bg-white/5 hover:text-white"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </nav>
        </div>
      </header>

      {/* Mobile Drawer Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-x-4 top-20 z-30 rounded-2xl border border-white/10 bg-[#131722]/95 p-6 backdrop-blur-2xl shadow-2xl sm:hidden"
          >
            <div className="flex flex-col space-y-3">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-[#A7AEC1] hover:bg-white/5 hover:text-white"
                >
                  {link.label}
                </a>
              ))}
              <div className="pt-4 border-t border-white/10 flex flex-col gap-2">
                <Link to="/register" onClick={() => setMobileMenuOpen(false)}>
                  <Button className="w-full bg-gradient-to-r from-[#4F46E5] to-[#7467FF] text-white font-semibold">
                    <Sparkles className="mr-1.5 h-3.5 w-3.5 text-indigo-200" />
                    Start 7-Day Free Trial
                  </Button>
                </Link>
                <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="outline" className="w-full border-white/10 text-white hover:bg-white/5">
                    Sign in to Portal
                  </Button>
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
