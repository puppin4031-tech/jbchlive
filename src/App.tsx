import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index.tsx";
import LivePage from "./pages/LivePage.tsx";
import LiveListPage from "./pages/LiveListPage.tsx";
import VodPage from "./pages/VodPage.tsx";
import ChannelPage from "./pages/ChannelPage.tsx";
import SearchPage from "./pages/SearchPage.tsx";
import LoginPage from "./pages/LoginPage.tsx";
import AdminPage from "./pages/AdminPage.tsx";
import CreateChannelPage from "./pages/CreateChannelPage.tsx";
import ChannelSettingsPage from "./pages/ChannelSettingsPage.tsx";
import ManageSermonsPage from "./pages/ManageSermonsPage.tsx";
import FavoritesPage from "./pages/FavoritesPage.tsx";
import MyChannelPage from "./pages/MyChannelPage.tsx";
import NotFound from "./pages/NotFound.tsx";
import { useEffect } from "react";
import { setupSecurityMonitoring } from "@/lib/security";

const queryClient = new QueryClient();

const SecurityInit = ({ children }: { children: React.ReactNode }) => {
  useEffect(() => {
    setupSecurityMonitoring();
  }, []);
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <SecurityInit>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<Index />} />
              <Route path="/live" element={<LiveListPage />} />
              <Route path="/live/:channelId" element={<LivePage />} />
              <Route path="/vod/:sermonId" element={<VodPage />} />
              <Route path="/channel/:channelId" element={<ChannelPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/login" element={<LoginPage />} />

              {/* Auth-required routes (server-verified) */}
              <Route path="/create-channel" element={
                <ProtectedRoute><CreateChannelPage /></ProtectedRoute>
              } />
              <Route path="/channel/:channelId/settings" element={
                <ProtectedRoute><ChannelSettingsPage /></ProtectedRoute>
              } />
              <Route path="/channel/:channelId/sermons" element={
                <ProtectedRoute><ManageSermonsPage /></ProtectedRoute>
              } />
              <Route path="/favorites" element={
                <ProtectedRoute><FavoritesPage /></ProtectedRoute>
              } />
              <Route path="/my-channel" element={
                <ProtectedRoute><MyChannelPage /></ProtectedRoute>
              } />

              {/* Admin-only route (server-verified admin role) */}
              <Route path="/admin" element={
                <ProtectedRoute requireAdmin><AdminPage /></ProtectedRoute>
              } />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </SecurityInit>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
