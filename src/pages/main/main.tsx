import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useLocation, useNavigate } from 'react-router-dom';
import ChunkLoader from '@/components/loader/chunk-loader';
import { generateOAuthURL } from '@/components/shared';
import DesktopWrapper from '@/components/shared_ui/desktop-wrapper';
import Dialog from '@/components/shared_ui/dialog';
import MobileWrapper from '@/components/shared_ui/mobile-wrapper';
import Tabs from '@/components/shared_ui/tabs/tabs';
import TradeTypeConfirmationModal from '@/components/trade-type-confirmation-modal';
import TradingViewModal from '@/components/trading-view-chart/trading-view-modal';
import { DBOT_TABS, TAB_IDS } from '@/constants/bot-contents';
import { api_base, load, updateWorkspaceName } from '@/external/bot-skeleton';
import { save_types } from '@/external/bot-skeleton/constants/save-type';
import { CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { isDbotRTL } from '@/external/bot-skeleton/utils/workspace';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import {
    disableUrlParameterApplication,
    enableUrlParameterApplication,
    setupTradeTypeChangeListener,
} from '@/utils/blockly-url-param-handler';
import {
    checkAndShowTradeTypeModal,
    getModalState,
    handleTradeTypeCancel,
    handleTradeTypeConfirm,
    resetUrlParamProcessing,
    setModalStateChangeCallback,
} from '@/utils/trade-type-modal-handler';
import { Localize, localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import RunPanel from '../../components/run-panel';
import ChartModal from '../chart/chart-modal';
import Dashboard from '../dashboard';
import RunStrategy from '../dashboard/run-strategy';
import './bulk-trading.scss';
import './copy-trading.css';
import './free-bots.scss';
import './main.scss';

const BOT_ASSET_PATH = '/bots/';
const BULK_TRADING_BOT_FILE = 'BULK_TRADING_APOLLO_DIGITS.xml';

type TBot = { title: string; image: string; filePath: string; xmlContent: string };
type TBotGroup = { label: string; bots: TBot[] };

const BOT_GROUPS: { label: string; files: string[] }[] = [
    {
        label: 'Over / Under',
        files: [
            'UNDER_9_5_OVER_3.xml',
            'UNDER_WITH_ENTRY.xml',
            'OVER_2_WITH_ENTRY.xml',
            'OVER_UNDER_WITH_ENTRYPOINT_.xml',
            'MAXXIEY_UNDER_BOT.xml',
            'MAXXIEY_UNDER_PRO_BOT.xml',
        ],
    },
    {
        label: 'Accumulators',
        files: [
            'Accumulators_.xml',
            'Accumulators_stat.xml',
            'ACCUMULATORS_WITH_MATINGALE.xml',
            'ACCUMULATORS__STATS_BOT.xml',
            'ACCUMULATORS__STATS_BOT_AND_RSI.xml',
        ],
    },
    {
        label: 'Differs',
        files: [
            'diff_v3.xml',
            'DIFF_SMART_BOT__1_.xml',
            'DIFFERS_GPT.xml',
            'DIFFERS_2_TICKS_10S_DELAY.xml',
            'DIFFERS_DIGIT_SWITCH_PRO__SMALLL_SCALE_TRADER_.xml',
            'exitspot__DIFFER_MASTER.xml',
        ],
    },
    {
        label: 'General',
        files: [
            'GREEN_AND_RED_BAR.xml',
            'maxxiey.xml',
            'maxxiey__NEW_GPT_CONDITIONS_.xml',
            'MAXXIEY_EVEN_ODD_SWITCH_BOT.xml',
            'Nick_Wealth_Gen.xml',
            'ant.xml',
            'percentage_Even_Odd_Bot.xml',
            'EMA_SMA__Sniper_Trend__v5__1_.xml',
        ],
    },
];

const DashboardIcon: React.FC = () => (
    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
        <rect x='4' y='4' width='7' height='7' rx='1.4' fill='currentColor' />
        <rect x='13' y='4' width='7' height='4' rx='1.2' fill='currentColor' opacity='0.72' />
        <rect x='13' y='10' width='7' height='10' rx='1.2' fill='currentColor' opacity='0.84' />
        <rect x='4' y='13' width='7' height='7' rx='1.4' fill='currentColor' opacity='0.92' />
    </svg>
);

const FreeBotsIcon: React.FC = () => (
    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
        <rect x='4' y='4' width='6' height='6' rx='1.4' fill='currentColor' opacity='0.94' />
        <rect x='14' y='4' width='6' height='6' rx='1.4' fill='currentColor' opacity='0.72' />
        <rect x='4' y='14' width='6' height='6' rx='1.4' fill='currentColor' opacity='0.72' />
        <rect x='14' y='14' width='6' height='6' rx='1.4' fill='currentColor' opacity='0.94' />
    </svg>
);

const BotBuilderIcon: React.FC = () => (
    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
        <rect x='4' y='4' width='5.5' height='5.5' rx='1.2' fill='currentColor' />
        <rect x='14.5' y='4' width='5.5' height='5.5' rx='1.2' fill='currentColor' opacity='0.74' />
        <rect x='9.25' y='14.5' width='5.5' height='5.5' rx='1.2' fill='currentColor' opacity='0.9' />
        <path d='M9 7.5H15M12 10.5V14M7 7.8V11.5M17 7.8V11.5' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' />
    </svg>
);

const DTraderIcon: React.FC = () => (
    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
        <path d='M4 19V5' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' />
        <path d='M4 19H20' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' />
        <path
            d='M6.5 15L10 11L13 14L18 8.5'
            stroke='currentColor'
            strokeWidth='1.8'
            strokeLinecap='round'
            strokeLinejoin='round'
        />
        <circle cx='10' cy='11' r='1.1' fill='currentColor' />
        <circle cx='13' cy='14' r='1.1' fill='currentColor' opacity='0.82' />
        <circle cx='18' cy='8.5' r='1.1' fill='currentColor' />
    </svg>
);

const ChartsIcon: React.FC = () => (
    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
        <path d='M4 19H20' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' />
        <path d='M4 19V5' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' />
        <path
            d='M6 15L9 12L12 14L17 8'
            stroke='currentColor'
            strokeWidth='1.8'
            strokeLinecap='round'
            strokeLinejoin='round'
        />
        <circle cx='6' cy='15' r='1.1' fill='currentColor' />
        <circle cx='9' cy='12' r='1.1' fill='currentColor' opacity='0.85' />
        <circle cx='12' cy='14' r='1.1' fill='currentColor' opacity='0.85' />
        <circle cx='17' cy='8' r='1.1' fill='currentColor' />
    </svg>
);

const TutorialsIcon: React.FC = () => (
    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
        <rect x='4' y='4' width='16' height='16' rx='4' stroke='currentColor' strokeWidth='1.7' />
        <path d='M10 8.2L16 12L10 15.8V8.2Z' fill='currentColor' />
    </svg>
);

const AnalysisToolIcon: React.FC = () => (
    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
        <path d='M6 5V19' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' />
        <circle cx='6' cy='9' r='1.6' fill='currentColor' />
        <path d='M12 5V19' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' />
        <circle cx='12' cy='15' r='1.6' fill='currentColor' />
        <path d='M18 5V19' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' />
        <circle cx='18' cy='11' r='1.6' fill='currentColor' />
    </svg>
);

const BulkTradingIcon: React.FC = () => (
    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
        <path d='M4 6H20L18.5 10H5.5L4 6Z' stroke='currentColor' strokeWidth='1.7' strokeLinejoin='round' />
        <path d='M5.5 10H18.5L17.2 18H6.8L5.5 10Z' stroke='currentColor' strokeWidth='1.7' strokeLinejoin='round' />
        <path d='M9 13H15M9 16H13' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' />
    </svg>
);

const CopyTradingIcon: React.FC = () => (
    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
        <rect x='4' y='5' width='10' height='13' rx='2' stroke='currentColor' strokeWidth='1.5' opacity='0.55' />
        <rect x='10' y='3' width='10' height='13' rx='2' stroke='currentColor' strokeWidth='1.7' />
        <path d='M13 7H18M13 10H18M13 13H16' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' />
    </svg>
);

const SignalsIcon: React.FC = () => (
    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
        <path d='M4 7H20' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' />
        <path d='M4 12H20' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' />
        <path d='M4 17H20' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' />
        <circle cx='7.5' cy='7' r='1.2' fill='currentColor' />
        <circle cx='12' cy='12' r='1.2' fill='currentColor' opacity='0.85' />
        <circle cx='16.5' cy='17' r='1.2' fill='currentColor' opacity='0.7' />
    </svg>
);

const TradingHubIcon: React.FC = () => (
    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
        <circle cx='12' cy='12' r='2.2' fill='currentColor' />
        <circle cx='5.5' cy='7' r='1.25' fill='currentColor' opacity='0.7' />
        <circle cx='18.5' cy='7' r='1.25' fill='currentColor' opacity='0.7' />
        <circle cx='5.5' cy='17' r='1.25' fill='currentColor' opacity='0.7' />
        <circle cx='18.5' cy='17' r='1.25' fill='currentColor' opacity='0.7' />
        <path
            d='M6.5 7.8L10 10M17.5 7.8L14 10M6.5 16.2L10 14M17.5 16.2L14 14'
            stroke='currentColor'
            strokeWidth='1.4'
            strokeLinecap='round'
        />
    </svg>
);

const BotIcon: React.FC = () => (
    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
        <circle cx='12' cy='12' r='9' stroke='currentColor' strokeWidth='1.6' />
        <circle cx='9.5' cy='11' r='1.1' fill='currentColor' />
        <circle cx='14.5' cy='11' r='1.1' fill='currentColor' />
        <path d='M9 15C10.2 15.9 13.8 15.9 15 15' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
    </svg>
);

const ChartWrapper = lazy(() => import('../chart/chart-wrapper'));
const Tutorial = lazy(() => import('../tutorials'));

const AppWrapper = observer(() => {
    const { connectionStatus, isAuthorized, isAuthorizing } = useApiBase();
    const { dashboard, load_modal, run_panel, quick_strategy, summary_card, blockly_store, client } = useStore();
    const { is_loading } = blockly_store;
    const {
        active_tab,
        active_tour,
        is_chart_modal_visible,
        is_trading_view_modal_visible,
        setActiveTab,
        setWebSocketState,
        setActiveTour,
        setTourDialogVisibility,
    } = dashboard;
    const { dashboard_strategies, onEntered } = load_modal;
    const {
        is_dialog_open,
        is_drawer_open,
        dialog_options,
        onCancelButtonClick,
        onCloseDialog,
        onOkButtonClick,
        stopBot,
    } = run_panel;
    const { is_open } = quick_strategy;
    const { cancel_button_text, ok_button_text, title, message, dismissable, is_closed_on_cancel } = dialog_options as {
        [key: string]: string;
    };
    const { clear } = summary_card;
    const { DASHBOARD, BOT_BUILDER } = DBOT_TABS;
    const init_render = React.useRef(true);
    const hash = [
        'dashboard',
        'free_bots',
        'bot_builder',
        'dtrader',
        'chart',
        'analysis_tool',
        'bulk_trading',
        'copy_trading',
        'tutorials',
        'signals',
        'trading_hub',
    ];
    const { isDesktop } = useDevice();
    const location = useLocation();
    const navigate = useNavigate();
    const [left_tab_shadow, setLeftTabShadow] = useState<boolean>(false);
    const [right_tab_shadow, setRightTabShadow] = useState<boolean>(false);
    const [botGroups, setBotGroups] = useState<TBotGroup[]>([]);
    const [copyTradingEnabled, setCopyTradingEnabled] = useState<boolean>(false);
    const [copyTraderToken, setCopyTraderToken] = useState<string>('');
    const [copyTradingStatus, setCopyTradingStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
    

    // Trade type modal state
    const [tradeTypeModalState, setTradeTypeModalState] = useState(getModalState());

    /**
     * Helper function to get modal props with enhanced type safety and clear documentation
     *
     * Props serve distinct purposes:
     * - current_trade_type: Technical identifier for API/internal use (format: "category/type")
     * - current_trade_type_display_name: Human-readable name for UI display
     *
     * This separation ensures proper data flow between technical systems and user interface
     */
    const getTradeTypeModalProps = () => {
        const { tradeTypeData } = tradeTypeModalState;

        return {
            is_visible: tradeTypeModalState.isVisible,
            trade_type_display_name: tradeTypeData?.displayName || '',

            // Technical identifier for internal/API use (e.g., "callput/callput")
            // Used by backend systems and technical integrations
            current_trade_type: tradeTypeData?.currentTradeType
                ? `${tradeTypeData.currentTradeType.tradeTypeCategory}/${tradeTypeData.currentTradeType.tradeType}`
                : 'N/A',

            // Human-readable display name for UI (e.g., "Rise/Fall")
            // Used for user-facing text and modal content
            current_trade_type_display_name: tradeTypeData?.currentTradeTypeDisplayName || 'N/A',

            onConfirm: handleTradeTypeConfirm,
            onCancel: handleTradeTypeCancel,
        };
    };

    let tab_value: number | string = active_tab;
    const GetHashedValue = (tab: number) => {
        tab_value = location.hash?.split('#')[1];
        if (!tab_value) return tab;
        return Number(hash.indexOf(String(tab_value)));
    };
    const active_hash_tab = GetHashedValue(active_tab);

    // Set up modal state change listener
    React.useEffect(() => {
        setModalStateChangeCallback(new_state => {
            setTradeTypeModalState(new_state);
        });
    }, [is_loading]);

    // Reset URL parameter processing when location changes
    React.useEffect(() => {
        resetUrlParamProcessing();
    }, [location.search]);

    React.useEffect(() => {
        const el_dashboard = document.getElementById('id-dbot-dashboard');
        const el_tutorial = document.getElementById('id-tutorials');

        const observer_dashboard = new window.IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setLeftTabShadow(false);
                    return;
                }
                setLeftTabShadow(true);
            },
            {
                root: null,
                threshold: 0.5, // set offset 0.1 means trigger if atleast 10% of element in viewport
            }
        );

        const observer_tutorial = new window.IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setRightTabShadow(false);
                    return;
                }
                setRightTabShadow(true);
            },
            {
                root: null,
                threshold: 0.5, // set offset 0.1 means trigger if atleast 10% of element in viewport
            }
        );
        observer_dashboard.observe(el_dashboard);
        observer_tutorial.observe(el_tutorial);
    });

    React.useEffect(() => {
        if (connectionStatus !== CONNECTION_STATUS.OPENED) {
            const is_bot_running = document.getElementById('db-animation__stop-button') !== null;
            if (is_bot_running) {
                clear();
                stopBot();
                api_base.setIsRunning(false);
                setWebSocketState(false);
            }
        }
    }, [clear, connectionStatus, setWebSocketState, stopBot]);

    // Update tab shadows height to match bot builder height
    const updateTabShadowsHeight = () => {
        const botBuilderEl = document.getElementById('id-bot-builder');
        const leftShadow = document.querySelector('.tabs-shadow--left') as HTMLElement;
        const rightShadow = document.querySelector('.tabs-shadow--right') as HTMLElement;

        if (botBuilderEl && leftShadow && rightShadow) {
            const height = botBuilderEl.offsetHeight;
            leftShadow.style.height = `${height}px`;
            rightShadow.style.height = `${height}px`;
        }
    };

    React.useEffect(() => {
        let pollTimeoutId: ReturnType<typeof setTimeout> | null = null;

        // Handle URL trade type parameters when switching to Bot Builder tab
        if (active_tab === BOT_BUILDER) {
            // Use requestAnimationFrame to ensure Blockly workspace is fully initialized
            requestAnimationFrame(() => {
                // Disable automatic URL parameter application to prevent changes before modal
                disableUrlParameterApplication();

                // Set up listener for manual trade type changes (only once)
                setupTradeTypeChangeListener();

                // Create unified handler for both immediate and delayed execution
                const handleTradeTypeModal = () => {
                    checkAndShowTradeTypeModal(
                        // onConfirm: Changes are now handled by the modal component
                        () => {
                            // Re-enable URL parameter application for future parameters
                            enableUrlParameterApplication();
                        },
                        // onCancel: URL parameter removal is now handled by the modal component
                        () => {}
                    );
                };

                // Wait for Blockly to finish loading before checking for URL parameters
                if (!blockly_store.is_loading) {
                    // Blockly is loaded, but add longer delay to ensure workspace is fully initialized
                    // and trade type fields are populated
                    setTimeout(() => {
                        handleTradeTypeModal();
                    }, 500);
                } else {
                    // Blockly is still loading, wait for it to finish with optimized polling
                    let pollAttempts = 0;
                    const maxPollAttempts = 10; // Maximum 5 seconds (10 * 500ms) - optimized performance

                    const checkBlocklyLoaded = () => {
                        if (!blockly_store.is_loading) {
                            handleTradeTypeModal();
                            return; // Exit polling once loaded
                        }

                        if (pollAttempts < maxPollAttempts) {
                            pollAttempts++;
                            // Use 500ms intervals for better performance (5x improvement from 100ms)
                            pollTimeoutId = setTimeout(checkBlocklyLoaded, 500);
                        } else {
                            console.warn(
                                'Blockly loading timeout after 5 seconds - proceeding without URL parameter check'
                            );
                        }
                    };

                    checkBlocklyLoaded();
                }
            });
        }

        // Cleanup function to prevent memory leaks
        return () => {
            if (pollTimeoutId) {
                clearTimeout(pollTimeoutId);
                pollTimeoutId = null;
            }
        };
    }, [active_tab, is_loading]);

    React.useEffect(() => {
        // Run on mount and when active tab changes
        updateTabShadowsHeight();

        if (is_open) {
            setTourDialogVisibility(false);
        }
        if (init_render.current) {
            setActiveTab(Number(active_hash_tab));
            if (!isDesktop) handleTabChange(Number(active_hash_tab));
            init_render.current = false;
        } else {
            // Preserve URL parameters when navigating
            const currentSearch = window.location.search;
            navigate(`${currentSearch}#${hash[active_tab] || hash[0]}`);
        }
        if (active_tour !== '') {
            setActiveTour('');
        }

        // Prevent scrolling when tutorial tab is active (only on mobile)
        const mainElement = document.querySelector('.main__container');
        if (active_tab === DBOT_TABS.TUTORIAL && !isDesktop) {
            document.body.style.overflow = 'hidden';
            if (mainElement instanceof HTMLElement) {
                mainElement.classList.add('no-scroll');
            }
        } else {
            document.body.style.overflow = '';
            if (mainElement instanceof HTMLElement) {
                mainElement.classList.remove('no-scroll');
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active_tab]);

    React.useEffect(() => {
        const trashcan_init_id = setTimeout(() => {
            if (active_tab === BOT_BUILDER && Blockly?.derivWorkspace?.trashcan) {
                const trashcanY = window.innerHeight - 250;
                let trashcanX;
                if (is_drawer_open) {
                    trashcanX = isDbotRTL() ? 380 : window.innerWidth - 460;
                } else {
                    trashcanX = isDbotRTL() ? 20 : window.innerWidth - 100;
                }
                Blockly?.derivWorkspace?.trashcan?.setTrashcanPosition(trashcanX, trashcanY);
            }
        }, 100);

        return () => {
            clearTimeout(trashcan_init_id); // Clear the timeout on unmount
        };
        //eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active_tab, is_drawer_open]);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        if (dashboard_strategies.length > 0) {
            // Needed to pass this to the Callback Queue as on tab changes
            // document title getting override by 'Bot | Deriv' only
            timer = setTimeout(() => {
                updateWorkspaceName();
            });
        }
        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [dashboard_strategies, active_tab]);

    // Fetch bots from XML files grouped by category
    React.useEffect(() => {
        const fetchBots = async () => {
            try {
                const groupResults: TBotGroup[] = await Promise.all(
                    BOT_GROUPS.map(async group => {
                        const botPromises = group.files.map(async fileName => {
                            try {
                                const response = await fetch(`${BOT_ASSET_PATH}${fileName}`);
                                if (!response.ok) {
                                    console.warn(`Failed to load bot file: ${fileName}`);
                                    return null;
                                }
                                const text = await response.text();
                                return {
                                    title: fileName.replace(/\.xml$/i, '').replace(/_/g, ' '),
                                    image: '',
                                    filePath: `${BOT_ASSET_PATH}${fileName}`,
                                    xmlContent: text,
                                } as TBot;
                            } catch (err) {
                                console.warn(`Error loading bot ${fileName}:`, err);
                                return null;
                            }
                        });
                        const loadedBots = (await Promise.all(botPromises)).filter(
                            (b): b is TBot => b !== null
                        );
                        return { label: group.label, bots: loadedBots };
                    })
                );
                setBotGroups(groupResults.filter(g => g.bots.length > 0));
            } catch (error) {
                console.error('Error fetching bots:', error);
            }
        };

        fetchBots();
    }, []);

    // Handle bot click - load bot into workspace
    const handleBotClick = useCallback(async (bot: { title: string; xmlContent: string; filePath: string }) => {
        try {
            const workspace = window.Blockly?.derivWorkspace;
            if (!workspace) {
                alert('Workspace not ready. Please try again.');
                return;
            }

            await load({
                block_string: bot.xmlContent,
                file_name: bot.title,
                workspace,
                from: save_types.GOOGLE_DRIVE,
                show_snackbar: true,
                drop_event: null,
                strategy_id: null,
                showIncompatibleStrategyDialog: () => Promise.resolve(false),
            });

            // Switch to bot builder tab
            setActiveTab(DBOT_TABS.BOT_BUILDER);

            // Call onEntered if available
            if (typeof onEntered === 'function') {
                onEntered();
            }
        } catch (error) {
            console.error('Error loading bot:', error);
            alert('Failed to load bot. Please try again.');
        }
    }, [setActiveTab, onEntered]);

    // Handle bulk trading bot click
    const handleBulkTradingBotClick = useCallback(async () => {
        try {
            const response = await fetch(`${BOT_ASSET_PATH}${BULK_TRADING_BOT_FILE}`);
            if (!response.ok) {
                alert('Bulk Trading Bot file not found. Please ensure the XML file is available.');
                return;
            }
            const xmlContent = await response.text();
            const workspace = window.Blockly?.derivWorkspace;
            if (!workspace) {
                alert('Workspace not ready. Please try again.');
                return;
            }

            await load({
                block_string: xmlContent,
                file_name: 'BULK_TRADING_APOLLO_DIGITS',
                workspace,
                from: save_types.LOCAL,
                show_snackbar: true,
                drop_event: null,
                strategy_id: null,
                showIncompatibleStrategyDialog: () => Promise.resolve(false),
            });

            setActiveTab(DBOT_TABS.BOT_BUILDER);

            if (typeof onEntered === 'function') {
                onEntered();
            }
        } catch (error) {
            console.error('Error loading Bulk Trading Bot:', error);
            alert('Failed to load Bulk Trading Bot. Please try again.');
        }
    }, [setActiveTab, onEntered]);

    // Copy trading toggle handler — uses Deriv copy_start / copy_stop API
    const handleCopyTradingToggle = useCallback(async () => {
        if (!copyTradingEnabled) {
            if (!copyTraderToken.trim()) {
                setCopyTradingStatus({ type: 'error', message: "Please enter the trader's Read-Only token." });
                return;
            }
            try {
                setCopyTradingStatus({ type: 'info', message: 'Connecting to trader…' });
                const response = await api_base.api?.send({
                    copy_start: copyTraderToken.trim(),
                });
                if (response?.error) {
                    setCopyTradingStatus({ type: 'error', message: response.error.message || 'Failed to start copy trading.' });
                } else {
                    setCopyTradingEnabled(true);
                    setCopyTradingStatus({ type: 'success', message: '✅ Copy trading active — mirroring trader\'s live positions.' });
                }
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : 'Unknown error';
                setCopyTradingStatus({ type: 'error', message: `Error: ${msg}` });
            }
        } else {
            try {
                setCopyTradingStatus({ type: 'info', message: 'Stopping copy trading…' });
                const response = await api_base.api?.send({
                    copy_stop: copyTraderToken.trim(),
                });
                if (response?.error) {
                    setCopyTradingStatus({ type: 'error', message: response.error.message || 'Failed to stop copy trading.' });
                } else {
                    setCopyTradingEnabled(false);
                    setCopyTradingStatus({ type: 'info', message: 'Copy trading stopped.' });
                }
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : 'Unknown error';
                setCopyTradingStatus({ type: 'error', message: `Error: ${msg}` });
            }
        }
    }, [copyTradingEnabled, copyTraderToken]);

    const handleTabChange = React.useCallback(
        (tab_index: number) => {
            setActiveTab(tab_index);
            const el_id = TAB_IDS[tab_index];
            if (el_id) {
                const el_tab = document.getElementById(el_id);
                setTimeout(() => {
                    el_tab?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                }, 10);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [active_tab]
    );

    // [AI]
    const handleLoginGeneration = async () => {
        const oauthUrl = await generateOAuthURL();
        if (oauthUrl) {
            window.location.replace(oauthUrl);
        } else {
            console.error('Failed to generate OAuth URL');
        }
    };
    // [/AI]
    return (
        <React.Fragment>
            <div className='main'>
                <div
                    className={classNames('main__container', {
                        'main__container--active': active_tour && active_tab === DASHBOARD && !isDesktop,
                    })}
                >
                    <div>
                        {!isDesktop && left_tab_shadow && <span className='tabs-shadow tabs-shadow--left' />}{' '}
                        <Tabs
                            active_index={active_tab}
                            className='main__tabs'
                            onTabItemClick={handleTabChange}
                            top
                        >
                            <div
                                label={
                                    <>
                                        <DashboardIcon />
                                        <Localize i18n_default_text='Dashboard' />
                                    </>
                                }
                                id='id-dbot-dashboard'
                            >
                                <Dashboard handleTabChange={handleTabChange} />
                            </div>
                            <div
                                label={
                                    <>
                                        <FreeBotsIcon />
                                        <Localize i18n_default_text='Free Bots' />
                                    </>
                                }
                                id='id-free-bots'
                            >
                                <div className='free-bots'>
                                    <h2 className='free-bots__heading'>
                                        <Localize i18n_default_text='Free Bots' />
                                    </h2>
                                    <div className='free-bots__content-wrapper'>
                                        {botGroups.length ? (
                                            botGroups.map(group => (
                                                <div className='free-bots__group' key={group.label}>
                                                    <h3 className='free-bots__group-label'>{group.label}</h3>
                                                    <ul className='free-bots__content'>
                                                        {group.bots.map(bot => (
                                                            <li
                                                                className='free-bot'
                                                                key={bot.filePath}
                                                                onClick={() => handleBotClick(bot)}
                                                            >
                                                                <div className='free-bot__details'>
                                                                    <h3 className='free-bot__title'>
                                                                        {bot.title}
                                                                    </h3>
                                                                    <div className='free-bot__description'>
                                                                        <Localize i18n_default_text='Quick-load XML' />
                                                                    </div>
                                                                </div>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            ))
                                        ) : (
                                            <div className='free-bots__empty'>
                                                <Localize i18n_default_text='Loading curated strategies…' />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div
                                label={
                                    <>
                                        <BotBuilderIcon />
                                        <Localize i18n_default_text='Bot Builder' />
                                    </>
                                }
                                id='id-bot-builder'
                            />
                            <div
                                label={
                                    <>
                                        <DTraderIcon />
                                        <Localize i18n_default_text='DTrader' />
                                    </>
                                }
                                id='id-dtrader'
                            >
                                <div style={{ width: '100%', height: 'calc(100vh - 120px)', overflow: 'hidden' }}>
                                    <iframe
                                        src='https://ddtrader.netlify.app/'
                                        width='100%'
                                        height='100%'
                                        title='DTrader'
                                        frameBorder={0}
                                        style={{ border: 'none', display: 'block' }}
                                        allow='clipboard-read; clipboard-write'
                                    />
                                </div>
                            </div>
                            <div
                                label={
                                    <>
                                        <ChartsIcon />
                                        <Localize i18n_default_text='Charts' />
                                    </>
                                }
                                id={
                                    is_chart_modal_visible || is_trading_view_modal_visible
                                        ? 'id-charts--disabled'
                                        : 'id-charts'
                                }
                            >
                                <Suspense
                                    fallback={<ChunkLoader message={localize('Please wait, loading chart...')} />}
                                >
                                    <ChartWrapper show_digits_stats={false} />
                                </Suspense>
                            </div>
                            <div
                                label={
                                    <>
                                        <AnalysisToolIcon />
                                        <Localize i18n_default_text='Analysis Tool' />
                                    </>
                                }
                                id='id-analysis-tool'
                            >
                                <div className='placeholder-panel'>
                                    <h3>
                                        <Localize i18n_default_text='Analysis Hub' />
                                    </h3>
                                    <p>
                                        <Localize i18n_default_text='Deep dive performance dashboards and metrics will land here shortly.' />
                                    </p>
                                </div>
                            </div>
                            <div
                                label={
                                    <>
                                        <TutorialsIcon />
                                        <Localize i18n_default_text='Tutorials' />
                                    </>
                                }
                                id='id-tutorials'
                            >
                                <div className='tutorials-wrapper'>
                                    <Suspense
                                        fallback={<ChunkLoader message={localize('Please wait, loading tutorials...')} />}
                                    >
                                        <Tutorial handleTabChange={handleTabChange} />
                                    </Suspense>
                                </div>
                            </div>
                            <div
                                label={
                                    <>
                                        <BulkTradingIcon />
                                        <Localize i18n_default_text='Bulk Trading' />
                                    </>
                                }
                                id='id-bulk-trading'
                            >
                                <div className='bulk-trading'>
                                    <h2 className='bulk-trading__heading'>
                                        <Localize i18n_default_text='Bulk Trading Bot' />
                                    </h2>
                                    <div className='bulk-trading__description'>
                                        <p>
                                            <Localize i18n_default_text='This pre-built bot demonstrates simultaneous contract purchases for diversified strategies.' />
                                        </p>
                                    </div>
                                    <div className='bulk-trading__content-wrapper'>
                                        <div className='bulk-trading__bot-preview'>
                                            <h3>
                                                <Localize i18n_default_text='Pre-built Bulk Trading Strategy' />
                                            </h3>
                                            <ul className='bulk-trading__features'>
                                                <li>✅ <Localize i18n_default_text='Purchases 5 contracts simultaneously' /></li>
                                                <li>✅ <Localize i18n_default_text='Risk diversification across multiple positions' /></li>
                                                <li>✅ <Localize i18n_default_text='Automated profit/loss management' /></li>
                                                <li>✅ <Localize i18n_default_text='Customizable contract types and amounts' /></li>
                                            </ul>
                                            <button className='bulk-trading__load-btn' onClick={handleBulkTradingBotClick}>
                                                <Localize i18n_default_text='Load Bulk Trading Bot' />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div
                                label={
                                    <>
                                        <CopyTradingIcon />
                                        <Localize i18n_default_text='Copy Trading' />
                                    </>
                                }
                                id='id-copy-trading'
                            >
                                <div className='copy-trading'>
                                    <h2 className='copy-trading__heading'>
                                        <Localize i18n_default_text='Copy Trading' />
                                    </h2>
                                    <p className='copy-trading__description'>
                                        <Localize i18n_default_text="Enter a trader's Read-Only token to mirror their live trades into your account via Deriv's copy trading API." />
                                    </p>
                                    <div className='copy-trading__content-wrapper'>
                                        {/* Token input */}
                                        <div className='copy-trading__field-group'>
                                            <label className='copy-trading__label'>
                                                <Localize i18n_default_text="Trader's Read-Only API Token" />
                                            </label>
                                            <div className='copy-trading__input-row'>
                                                <input
                                                    className='copy-trading__token-input'
                                                    type='text'
                                                    placeholder='e.g. HKssR2os2KbKFJ3...'
                                                    value={copyTraderToken}
                                                    onChange={e => setCopyTraderToken(e.target.value)}
                                                    disabled={copyTradingEnabled}
                                                />
                                                <button
                                                    className={`copy-trading__action-btn ${copyTradingEnabled ? 'copy-trading__action-btn--stop' : 'copy-trading__action-btn--start'}`}
                                                    onClick={handleCopyTradingToggle}
                                                    disabled={!copyTraderToken.trim() && !copyTradingEnabled}
                                                >
                                                    {copyTradingEnabled
                                                        ? localize('Stop Copying')
                                                        : localize('Start Copying')}
                                                </button>
                                            </div>
                                            {copyTradingStatus && (
                                                <div className={`copy-trading__status copy-trading__status--${copyTradingStatus.type}`}>
                                                    {copyTradingStatus.message}
                                                </div>
                                            )}
                                        </div>

                                        {/* How it works */}
                                        <div className='copy-trading__info'>
                                            <h4><Localize i18n_default_text='How it works' /></h4>
                                            <ol className='copy-trading__steps'>
                                                <li><Localize i18n_default_text='The trader generates a Read-Only token from their Deriv account settings.' /></li>
                                                <li><Localize i18n_default_text='Paste the token above and click Start Copying.' /></li>
                                                <li><Localize i18n_default_text="Deriv mirrors every trade they place into your account automatically." /></li>
                                                <li><Localize i18n_default_text='Click Stop Copying at any time to unsubscribe.' /></li>
                                            </ol>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div
                                label={
                                    <>
                                        <SignalsIcon />
                                        <Localize i18n_default_text='Signals' />
                                    </>
                                }
                                id='id-signals'
                            >
                                <div className='dashboard__chart-wrapper'>
                                    <iframe src='signals' width='100%' height={600} title='Signals' frameBorder={0} />
                                </div>
                            </div>
                            <div
                                label={
                                    <>
                                        <TradingHubIcon />
                                        <Localize i18n_default_text='Trading Hub' />
                                    </>
                                }
                                id='id-trading-hub'
                            >
                                <div className='dashboard__chart-wrapper'>
                                    <iframe
                                        src='https://mekop.netlify.app'
                                        width='100%'
                                        height={600}
                                        title='Trading Hub'
                                        frameBorder={0}
                                        style={{ border: 'none' }}
                                    />
                                </div>
                            </div>
                        </Tabs>
                        {!isDesktop && right_tab_shadow && <span className='tabs-shadow tabs-shadow--right' />}{' '}
                    </div>
                </div>
            </div>
            <DesktopWrapper>
                <div className='main__run-strategy-wrapper'>
                    <RunStrategy />
                    <RunPanel />
                </div>
                <ChartModal />
                <TradingViewModal />
            </DesktopWrapper>
            <MobileWrapper>{!is_open && <RunPanel />}</MobileWrapper>
            <Dialog
                cancel_button_text={cancel_button_text || localize('Cancel')}
                className='dc-dialog__wrapper--fixed'
                confirm_button_text={ok_button_text || localize('Ok')}
                has_close_icon
                is_mobile_full_width={false}
                is_visible={is_dialog_open}
                onCancel={onCancelButtonClick}
                onClose={onCloseDialog}
                onConfirm={onOkButtonClick || onCloseDialog}
                portal_element_id='modal_root'
                title={title}
                login={handleLoginGeneration}
                dismissable={dismissable} // Prevents closing on outside clicks
                is_closed_on_cancel={is_closed_on_cancel}
            >
                {message}
            </Dialog>

            {/* Trade Type Confirmation Modal */}
            {(() => {
                const modalProps = getTradeTypeModalProps();
                return (
                    <TradeTypeConfirmationModal
                        is_visible={modalProps.is_visible}
                        trade_type_display_name={modalProps.trade_type_display_name}
                        current_trade_type={modalProps.current_trade_type}
                        current_trade_type_display_name={modalProps.current_trade_type_display_name}
                        onConfirm={modalProps.onConfirm}
                        onCancel={modalProps.onCancel}
                    />
                );
            })()}
        </React.Fragment>
    );
});

export default AppWrapper;
