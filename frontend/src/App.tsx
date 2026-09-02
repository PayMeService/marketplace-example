import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { useAuth } from './lib/auth-context';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Storefront } from './pages/Storefront';
import { Products } from './pages/Products';
import { BecomeSeller } from './pages/BecomeSeller';
import { SellerDashboard } from './pages/SellerDashboard';
import { Buy } from './pages/Buy';
import { Checkout } from './pages/Checkout';
import { CheckoutReturn } from './pages/CheckoutReturn';
import { Sales } from './pages/Sales';
import { Subscriptions } from './pages/Subscriptions';
import { AdminSellers } from './pages/AdminSellers';
import { AdminCallbacks } from './pages/AdminCallbacks';
import { AdminSettings } from './pages/AdminSettings';
import type { Role } from './lib/types';

function Protected({
  roles,
  children,
}: {
  roles?: Role[];
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Storefront />} />
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />

            <Route
              path="products"
              element={
                <Protected>
                  <Products />
                </Protected>
              }
            />
            <Route
              path="sell"
              element={
                <Protected>
                  <BecomeSeller />
                </Protected>
              }
            />
            <Route
              path="seller"
              element={
                <Protected roles={['seller', 'admin']}>
                  <SellerDashboard />
                </Protected>
              }
            />
            {/* Buyer-initiated purchase. Any signed-in user, not just sellers:
                the seller is derived from the listing. */}
            <Route
              path="buy/:productId"
              element={
                <Protected>
                  <Buy />
                </Protected>
              }
            />
            <Route
              path="checkout"
              element={
                <Protected roles={['seller', 'admin']}>
                  <Checkout />
                </Protected>
              }
            />
            {/* Where PayMe's hosted page redirects the buyer. Public: the buyer
                may not be signed in to this app at all. */}
            <Route path="checkout/return" element={<CheckoutReturn />} />
            <Route
              path="sales"
              element={
                <Protected roles={['seller', 'admin']}>
                  <Sales />
                </Protected>
              }
            />
            <Route
              path="subscriptions"
              element={
                <Protected roles={['seller', 'admin']}>
                  <Subscriptions />
                </Protected>
              }
            />
            <Route
              path="admin/sellers"
              element={
                <Protected roles={['admin']}>
                  <AdminSellers />
                </Protected>
              }
            />
            <Route
              path="admin/callbacks"
              element={
                <Protected roles={['admin']}>
                  <AdminCallbacks />
                </Protected>
              }
            />
            <Route
              path="admin/settings"
              element={
                <Protected roles={['admin']}>
                  <AdminSettings />
                </Protected>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
