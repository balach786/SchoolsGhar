import { MotionConfig } from 'framer-motion';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AuthProvider } from '@/context/AuthContext';
import { AppRoutes } from '@/routes';
import { Toaster } from '@/components/ui/sonner';

export default function App() {
  return (
    <ThemeProvider defaultTheme="system">
      <MotionConfig reducedMotion="user"><AuthProvider>
        <AppRoutes />
        <Toaster richColors position="top-right" />
      </AuthProvider></MotionConfig>
    </ThemeProvider>
  );
}
