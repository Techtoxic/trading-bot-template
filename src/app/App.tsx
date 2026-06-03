import { lazy, Suspense } from 'react';
import React from 'react';
import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider } from 'react-router-dom';
import ChunkLoader from '@/components/loader/chunk-loader';
import LocalStorageSyncWrapper from '@/components/localStorage-sync-wrapper';
import RoutePromptDialog from '@/components/route-prompt-dialog';
import { useAccountSwitching } from '@/hooks/useAccountSwitching';
import { useLanguageFromURL } from '@/hooks/useLanguageFromURL';
import { useOAuthCallback } from '@/hooks/useOAuthCallback';
import { StoreProvider } from '@/hooks/useStore';
import { OAuthTokenExchangeService } from '@/services/oauth-token-exchange.service';
import { initializeI18n, localize, TranslationProvider } from '@deriv-com/translations';
import CoreStoreProvider from './CoreStoreProvider';
import './app-root.scss';

const Layout = lazy(() => import('../components/layout'));
const AppRoot = lazy(() => import('./app-root'));

// Translations CDN is optional — requires TRANSLATIONS_CDN_URL, R2_PROJECT_NAME, and CROWDIN_BRANCH_NAME env vars.
// Without these, the app defaults to English. See user-guide/03-white-labeling.md#translations for setup instructions.
const i18nInstance = initializeI18n({ cdnUrl: '' });

/**
 * Component wrapper to handle language URL parameter
 * Uses the useLanguageFromURL hook to process language switching
 */
const LanguageHandler = ({ children }: { children: React.ReactNode }) => {
    useLanguageFromURL();
    return <>{children}</>;
};

const router = createBrowserRouter(
    createRoutesFromElements(
        <Route
            path='/'
            element={
                <Suspense
                    fallback={<ChunkLoader message={localize('Please wait while we connect to the server...')} />}
                >
                    <TranslationProvider defaultLang='EN' i18nInstance={i18nInstance}>
                        <LanguageHandler>
                            <StoreProvider>
                                <LocalStorageSyncWrapper>
                                    <RoutePromptDialog />
                                    <CoreStoreProvider>
                                        <Layout />
                                    </CoreStoreProvider>
                                </LocalStorageSyncWrapper>
                            </StoreProvider>
                        </LanguageHandler>
                    </TranslationProvider>
                </Suspense>
            }
        >
            {/* All child routes will be passed as children to Layout */}
            <Route index element={<AppRoot />} />
        </Route>
    )
);

/**
 * Main App component
 *
 * Responsibilities:
 * 1. OAuth callback handling (via useOAuthCallback hook)
 * 2. Account switching from URL (via useAccountSwitching hook)
 * 3. Router provider setup
 *
 * All complex logic has been extracted into custom hooks for better maintainability
 */
function App() {
    // Handle OAuth callback flow (CSRF validation + code extraction)
    const { isProcessing, isValid, params, error, cleanupURL } = useOAuthCallback();

    // Handle account switching via URL parameter
    useAccountSwitching();

    // Handle legacy token flow (?acct1=&token1=&cur1= params from old Deriv OAuth)
    React.useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const acct1 = urlParams.get('acct1');
        const token1 = urlParams.get('token1');

        if (acct1 && token1) {
            // Build accounts object from URL params
            const accounts: Record<string, string> = {};
            const clientAccounts: Record<string, { token: string; currency: string }> = {};

            let i = 1;
            while (urlParams.get(`acct${i}`) && urlParams.get(`token${i}`)) {
                const acct = urlParams.get(`acct${i}`) as string;
                const token = urlParams.get(`token${i}`) as string;
                const cur = urlParams.get(`cur${i}`) || '';
                accounts[acct] = token;
                clientAccounts[acct] = { token, currency: cur };
                i++;
            }

            // Store in localStorage (same format the app expects)
            localStorage.setItem('accountsList', JSON.stringify(accounts));
            localStorage.setItem('clientAccounts', JSON.stringify(clientAccounts));
            localStorage.setItem('authToken', token1);
            localStorage.setItem('active_loginid', acct1);
            localStorage.setItem('account_type', acct1.startsWith('VR') ? 'demo' : 'real');

            // Clean up URL params
            const cleanUrl = window.location.origin + window.location.pathname;
            window.history.replaceState({}, '', cleanUrl);

            // Reload to initialize the app with the new accounts
            window.location.reload();
        }
    }, []);

    // Process the authorization code when OAuth callback is valid (new flow)
    React.useEffect(() => {
        if (!isProcessing && isValid && params.code) {
            // Exchange authorization code for access token
            OAuthTokenExchangeService.exchangeCodeForToken(params.code)
                .then(response => {
                    if (response.access_token) {
                        cleanupURL();
                    } else if (response.error) {
                        console.error('❌ Token exchange failed:', response.error);
                        console.error('Error description:', response.error_description);
                        cleanupURL();
                    }
                })
                .catch(error => {
                    console.error('❌ Token exchange request failed:', error);
                    cleanupURL();
                });
        } else if (!isProcessing && error) {
            console.error('OAuth callback error:', error);
        }
    }, [isProcessing, isValid, params.code, error, cleanupURL]);

    return <RouterProvider router={router} />;
}

export default App;
