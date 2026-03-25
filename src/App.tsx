import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/live" element={<LiveListPage />} />
            <Route path="/live/:channelId" element={<LivePage />} />
            <Route path="/vod/:sermonId" element={<VodPage />} />
            <Route path="/channel/:channelId" element={<ChannelPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/create-channel" element={<CreateChannelPage />} />
            <Route path="/channel/:channelId/settings" element={<ChannelSettingsPage />} />
            <Route path="/favorites" element={<FavoritesPage />} />
            <Route path="/my-channel" element={<MyChannelPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
