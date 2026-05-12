type TTabsTitle = {
    [key: string]: string | number;
};

type TDashboardTabIndex = {
    [key: string]: number;
};

export const tabs_title: TTabsTitle = Object.freeze({
    WORKSPACE: 'Workspace',
    CHART: 'Chart',
});

export const DBOT_TABS: TDashboardTabIndex = Object.freeze({
    DASHBOARD: 0,
    FREE_BOTS: 1,
    BOT_BUILDER: 2,
    DTRADER: 3,
    CHART: 4,
    ANALYSIS_TOOL: 5,
    BULK_TRADING: 6,
    COPY_TRADING: 7,
    TUTORIAL: 8,
    SIGNALS: 9,
    TRADING_HUB: 10,
});

export const MAX_STRATEGIES = 10;

export const TAB_IDS = [
    'id-dbot-dashboard',
    'id-free-bots',
    'id-bot-builder',
    'id-dtrader',
    'id-charts',
    'id-analysis-tool',
    'id-bulk-trading',
    'id-copy-trading',
    'id-tutorials',
    'id-signals',
    'id-trading-hub',
];

export const DEBOUNCE_INTERVAL_TIME = 500;
