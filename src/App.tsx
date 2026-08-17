import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { Suspense, lazy, useEffect } from "react";

// Home stays eager (it is the entry point); everything else is code-split.
import Index from "./pages/Index.tsx";

const LivePage = lazy(() => import("./pages/LivePage.tsx"));
const LiveListPage = lazy(() => import("./pages/LiveListPage.tsx"));
const VodPage = lazy(() => import("./pages/VodPage.tsx"));
const ChannelPage = lazy(() => import("./pages/ChannelPage.tsx"));
const SearchPage = lazy(() => import("./pages/SearchPage.tsx"));
const LoginPage = lazy(() => import("./pages/LoginPage.tsx"));
const AdminPage = lazy(() => import("./pages/AdminPage.tsx"));
const CreateChannelPage = lazy(() => import("./pages/CreateChannelPage.tsx"));
const ChannelSettingsPage = lazy(() => import("./pages/ChannelSettingsPage.tsx"));
const ManageSermonsPage = lazy(() => import("./pages/ManageSermonsPage.tsx"));
const FavoritesPage = lazy(() => import("./pages/FavoritesPage.tsx"));
const SubscriptionsPage = lazy(() => import("./pages/SubscriptionsPage.tsx"));
const MyChannelPage = lazy(() => import("./pages/MyChannelPage.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const SupportPage = lazy(() => import("./pages/SupportPage.tsx"));
const SupportTicketPage = lazy(() => import("./pages/SupportTicketPage.tsx"));
const YouTubeCallbackPage = lazy(() => import("./pages/YouTubeCallbackPage.tsx"));
const PricingPage = lazy(() => import("./pages/PricingPage.tsx"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent.tsx"));
const CommunityPage = lazy(() => import("./pages/CommunityPage.tsx"));
const CommunityCategoryPage = lazy(() => import("./pages/CommunityCategoryPage.tsx"));
const CommunityPostPage = lazy(() => import("./pages/CommunityPostPage.tsx"));
const CommunityWritePage = lazy(() => import("./pages/CommunityWritePage.tsx"));

const FloatingBroadcasterDock = lazy(
  () => import("@/components/broadcaster/FloatingBroadcasterDock")
);

import { setupSecurityMonitoring } from "@/lib/security";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

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
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                {/* Public routes */}
                <Route path="/" element={<Index />} />
                <Route path="/live" element={<LiveListPage />} />
                <Route path="/live/:channelId" element={<LivePage />} />
                <Route path="/vod/:sermonId" element={<VodPage />} />
                <Route path="/channel/:channelId" element={<ChannelPage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/pricing" element={<PricingPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
                <Route path="/auth/youtube/callback" element={
                  <ProtectedRoute><YouTubeCallbackPage /></ProtectedRoute>
                } />

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
                <Route path="/subscriptions" element={
                  <ProtectedRoute><SubscriptionsPage /></ProtectedRoute>
                } />
                <Route path="/my-channel" element={
                  <ProtectedRoute><MyChannelPage /></ProtectedRoute>
                } />
                <Route path="/community" element={
                  <ProtectedRoute><CommunityPage /></ProtectedRoute>
                } />
                <Route path="/community/write" element={
                  <ProtectedRoute><CommunityWritePage /></ProtectedRoute>
                } />
                <Route path="/community/category/:slug" element={
                  <ProtectedRoute><CommunityCategoryPage /></ProtectedRoute>
                } />
                <Route path="/community/:postId" element={
                  <ProtectedRoute><CommunityPostPage /></ProtectedRoute>
                } />
                <Route path="/community/:postId/edit" element={
                  <ProtectedRoute><CommunityWritePage /></ProtectedRoute>
                } />
                <Route path="/support" element={
                  <ProtectedRoute><SupportPage /></ProtectedRoute>
                } />

                <Route path="/support/:ticketId" element={
                  <ProtectedRoute><SupportTicketPage /></ProtectedRoute>
                } />
                <Route path="/admin/support/:ticketId" element={
                  <ProtectedRoute><SupportTicketPage /></ProtectedRoute>
                } />

                {/* Admin-only route (server-verified admin role) */}
                <Route path="/admin" element={
                  <ProtectedRoute requireAdmin><AdminPage /></ProtectedRoute>
                } />

                <Route path="*" element={<NotFound />} />
              </Routes>
              <FloatingBroadcasterDock />
            </Suspense>
          </BrowserRouter>
        </SecurityInit>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
