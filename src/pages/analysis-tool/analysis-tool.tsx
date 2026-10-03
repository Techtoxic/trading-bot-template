import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { useApiBase } from '@/hooks/useApiBase';
import { Localize, localize } from '@deriv-com/translations';
import './analysis-tool.scss';

// Curated list of synthetic indices that support digit-based contracts
// (Matches/Differs, Over/Under, Even/Odd). Values are Deriv's underlying
// symbol codes; labels mirror developers.deriv.com/docs active_symbols names.
const DEFAULT_DIGIT_SYMBOLS: { value: string; label: string }[] = [
    { value: '1HZ10V', label: 'Volatility 10 (1s) Index' },
    { value: '1HZ25V', label: 'Volatility 25 (1s) Index' },
    { value: '1HZ50V', label: 'Volatility 50 (1s) Index' },
    { value: '1HZ75V', label: 'Volatility 75 (1s) Index' },
    { value: '1HZ100V', label: 'Volatility 100 (1s) Index' },
    { value: '1HZ150V', label: 'Volatility 150 (1s) Index' },
    { value: '1HZ200V', label: 'Volatility 200 (1s) Index' },
    { value: '1HZ250V', label: 'Volatility 250 (1s) Index' },
    { value: '1HZ300V', label: 'Volatility 300 (1s) Index' },
    { value: 'R_10', label: 'Volatility 10 Index' },
    { value: 'R_25', label: 'Volatility 25 Index' },
    { value: 'R_50', label: 'Volatility 50 Index' },
    { value: 'R_75', label: 'Volatility 75 Index' },
    { value: 'R_100', label: 'Volatility 100 Index' },
];

const DEFAULT_TICK_COUNT = 500;
const MIN_TICK_COUNT = 50;
const MAX_TICK_COUNT = 5000;
const DEFAULT_PIP_SIZE = 2;

type TTick = { epoch: number; quote: number };

// api_base.api's TypeScript type declares send() as returning void, but at
// runtime it's DerivAPIBasic's send(), which returns a Promise resolving
// with the response (see other call sites in this codebase, e.g.
// tradeEngine/trade/Sell.js). This local type reflects the real behavior
// for the calls this component actually makes.
type TDerivApiResponse = {
    error?: { code?: string; message?: string };
    subscription?: { id: string };
    history?: { prices: number[]; times: number[] };
    active_symbols?: Array<{ symbol?: string; display_name?: string }>;
};
type TDerivApi = {
    send: (request: Record<string, unknown>) => Promise<TDerivApiResponse>;
    onMessage: () => {
        subscribe: (callback: (message: { data: any }) => void) => { unsubscribe: () => void };
    };
};
const getApi = (): TDerivApi | null => (api_base.api as unknown as TDerivApi) ?? null;

/**
 * Extracts the last decimal digit of a quote, respecting the symbol's pip
 * size. This matters: raw floats silently drop trailing zeros
 * (6210.00 -> 6210), which would corrupt the digit distribution unless the
 * quote is re-padded to the correct number of decimal places first.
 */
const lastDigitOf = (quote: number, pip_size: number): number => {
    const fixed = quote.toFixed(pip_size);
    return Number(fixed.charAt(fixed.length - 1));
};

const AnalysisTool: React.FC = () => {
    const { connectionStatus } = useApiBase();
    const [symbol, setSymbol] = useState('1HZ100V');
    const [marketOptions, setMarketOptions] = useState(DEFAULT_DIGIT_SYMBOLS);
    const [tickCount, setTickCount] = useState(DEFAULT_TICK_COUNT);
    const [tickCountInput, setTickCountInput] = useState(String(DEFAULT_TICK_COUNT));
    const [analyzedTickCount, setAnalyzedTickCount] = useState(DEFAULT_TICK_COUNT);
    const [ticks, setTicks] = useState<TTick[]>([]);
    const [selectedDigit, setSelectedDigit] = useState<number | null>(null);
    const [tradeMode, setTradeMode] = useState<'matches' | 'differs'>('matches');
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isLoadingMarkets, setIsLoadingMarkets] = useState(false);

    // Refs so the persistent onMessage listener always sees current values
    // without needing to be torn down/recreated on every state change.
    const subscriptionIdRef = useRef<string | null>(null);
    const symbolRef = useRef(symbol);
    const pipSizeRef = useRef(DEFAULT_PIP_SIZE);
    const tickCountRef = useRef(DEFAULT_TICK_COUNT);
    tickCountRef.current = tickCount;

    const clampTickCount = (value: string): number => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TICK_COUNT;
        return Math.min(MAX_TICK_COUNT, Math.max(MIN_TICK_COUNT, Math.round(parsed)));
    };

    const forgetCurrentSubscription = useCallback(() => {
        const id = subscriptionIdRef.current;
        const api = getApi();
        if (id && api) {
            api.send({ forget: id }).catch(() => {
                // Subscription may already be gone (e.g. socket reconnected); nothing to do.
            });
        }
        subscriptionIdRef.current = null;
    }, []);

    const requestTickHistory = useCallback(async (target_symbol: string) => {
        const api = getApi();
        if (!api) return;

        setIsLoading(true);
        setErrorMessage(null);
        forgetCurrentSubscription();
        const requestedTickCount = tickCountRef.current;
        setAnalyzedTickCount(requestedTickCount);

        // Resolve pip size for correct digit extraction (see lastDigitOf).
        // api_base.pip_sizes is populated from active_symbols once connected.
        const pip_sizes = (api_base.pip_sizes ?? {}) as Record<string, number>;
        const pip_size = pip_sizes[target_symbol] ?? DEFAULT_PIP_SIZE;
        pipSizeRef.current = pip_size;

        try {
            // ticks_history accepts a caller-selected count and can stay subscribed for live updates.
            const response = await api.send({
                ticks_history: target_symbol,
                adjust_start_time: 1,
                count: requestedTickCount,
                end: 'latest',
                start: 1,
                style: 'ticks',
                subscribe: 1,
            });

            if (symbolRef.current !== target_symbol) {
                // Symbol changed again before this response arrived; drop it
                // and let the newer request's response take over instead.
                if (response?.subscription?.id) {
                    getApi()?.send({ forget: response.subscription.id }).catch(() => undefined);
                }
                return;
            }

            if (response?.error) {
                setErrorMessage(response.error.message || localize('Unable to load tick history.'));
                setIsLoading(false);
                return;
            }

            const prices: number[] = response?.history?.prices ?? [];
            const times: number[] = response?.history?.times ?? [];
            const history_ticks: TTick[] = prices.map((quote, index) => ({
                quote: Number(quote),
                epoch: Number(times[index]),
            }));

            subscriptionIdRef.current = response?.subscription?.id ?? null;
            setTicks(history_ticks.slice(-requestedTickCount));
            setIsLoading(false);
        } catch (error: any) {
            if (symbolRef.current !== target_symbol) return;
            setErrorMessage(error?.error?.message || localize('Connection error while loading ticks.'));
            setIsLoading(false);
        }
    }, [forgetCurrentSubscription]);

    // Load the current Volatility catalogue so newly added markets appear without a code update.
    useEffect(() => {
        const api = getApi();
        if (connectionStatus !== CONNECTION_STATUS.OPENED || !api) return;

        setIsLoadingMarkets(true);
        api.send({ active_symbols: 'brief', product_type: 'basic' })
            .then(response => {
                const markets = (response.active_symbols ?? [])
                    .filter(item => item.symbol && /^Volatility\s+\d+/i.test(item.display_name ?? ''))
                    .map(item => ({ value: item.symbol as string, label: item.display_name as string }))
                    .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }));

                if (!markets.length) return;
                setMarketOptions(markets);
                setSymbol(current => (markets.some(item => item.value === current) ? current : markets[0].value));
                setIsLoadingMarkets(false);
            })
            .catch(() => {
                // Keep the curated fallback list if active_symbols is unavailable.
                setIsLoadingMarkets(false);
            });
    }, [connectionStatus]);

    const handleAnalyze = () => {
        const normalizedCount = clampTickCount(tickCountInput);
        setTickCountInput(String(normalizedCount));
        setTickCount(normalizedCount);
        tickCountRef.current = normalizedCount;
        requestTickHistory(symbol);
    };

    // (Re)subscribe whenever the symbol changes or the socket (re)connects.
    useEffect(() => {
        symbolRef.current = symbol;
        if (connectionStatus === CONNECTION_STATUS.OPENED && getApi()) {
            requestTickHistory(symbol);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [symbol, connectionStatus]);

    // Persistent live-tick listener: append new ticks while respecting the selected window.
    useEffect(() => {
        const api = getApi();
        if (!api) return undefined;

        const subscription = api.onMessage().subscribe(({ data }: { data: any }) => {
            if (data?.msg_type !== 'tick') return;
            if (!data.tick || data.tick.id !== subscriptionIdRef.current) return;

            const new_tick: TTick = { quote: Number(data.tick.quote), epoch: Number(data.tick.epoch) };
            setTicks(prev => [...prev, new_tick].slice(-tickCountRef.current));
        });

        return () => subscription.unsubscribe();
    }, [connectionStatus]);

    // Clean up the live subscription on unmount so it doesn't keep running
    // (and consuming the connection) after the user leaves this tab.
    useEffect(() => {
        return () => forgetCurrentSubscription();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const digitCounts = Array(10).fill(0);
    ticks.forEach(tick => {
        const digit = lastDigitOf(tick.quote, pipSizeRef.current);
        if (digit >= 0 && digit <= 9) digitCounts[digit] += 1;
    });
    const total = ticks.length;
    const percentages = digitCounts.map(count => (total ? (count / total) * 100 : 0));
    const maxPct = total ? Math.max(...percentages) : 0;
    const minPct = total ? Math.min(...percentages) : 0;
    const maxIndex = percentages.indexOf(maxPct);
    const minIndex = percentages.indexOf(minPct);

    const lastTick = ticks.length ? ticks[ticks.length - 1] : null;
    const lastDigit = lastTick ? lastDigitOf(lastTick.quote, pipSizeRef.current) : null;

    return (
        <div className='analysis-tool'>
            <div className='analysis-tool__header'>
                <h3>
                    <Localize i18n_default_text='How to trade Matches/Differs?' />
                </h3>
            </div>

            <div className='analysis-tool__controls'>
                <label className='analysis-tool__market-select'>
                    <span>
                        <Localize i18n_default_text='Volatility market' /> ({marketOptions.length})
                    </span>
                    <select
                        className='analysis-tool__symbol-select'
                        value={symbol}
                        onChange={e => setSymbol(e.target.value)}
                        aria-label={localize('Volatility market')}
                    >
                        {marketOptions.map(item => (
                            <option key={item.value} value={item.value}>
                                {item.label}
                            </option>
                        ))}
                    </select>
                    {isLoadingMarkets && <small><Localize i18n_default_text='Loading markets…' /></small>}
                </label>

                <label className='analysis-tool__tick-count'>
                    <span><Localize i18n_default_text='Ticks to analyze' /></span>
                    <input
                        type='number'
                        min={MIN_TICK_COUNT}
                        max={MAX_TICK_COUNT}
                        step='50'
                        value={tickCountInput}
                        onChange={event => setTickCountInput(event.target.value)}
                        onBlur={() => {
                            const normalizedCount = clampTickCount(tickCountInput);
                            setTickCountInput(String(normalizedCount));
                            setTickCount(normalizedCount);
                        }}
                        aria-label={localize('Ticks to analyze')}
                    />
                </label>

                <button
                    type='button'
                    className='analysis-tool__analyze-button'
                    onClick={handleAnalyze}
                    disabled={isLoading}
                >
                    <Localize i18n_default_text='Analyze ticks' />
                </button>

                <div className='analysis-tool__toggle'>
                    <button
                        type='button'
                        className={tradeMode === 'matches' ? 'active' : ''}
                        onClick={() => setTradeMode('matches')}
                    >
                        <Localize i18n_default_text='Matches' />
                    </button>
                    <button
                        type='button'
                        className={tradeMode === 'differs' ? 'active' : ''}
                        onClick={() => setTradeMode('differs')}
                    >
                        <Localize i18n_default_text='Differs' />
                    </button>
                </div>
            </div>

            <div className='analysis-tool__status'>
                {isLoading && <span><Localize i18n_default_text='Loading tick history…' /></span>}
                {!isLoading && errorMessage && <span className='analysis-tool__error'>{errorMessage}</span>}
                {!isLoading && !errorMessage && (
                    <>
                        <span>
                            <Localize
                                i18n_default_text='{{count}}/{{window}} ticks analyzed'
                                values={{ count: total, window: analyzedTickCount }}
                            />
                        </span>
                        {lastTick && (
                            <span className='analysis-tool__spot'>
                                <Localize i18n_default_text='Spot' />: {lastTick.quote.toFixed(pipSizeRef.current)}
                                {lastDigit !== null && (
                                    <strong className='analysis-tool__last-digit'> ({lastDigit})</strong>
                                )}
                            </span>
                        )}
                    </>
                )}
            </div>

            <div className='analysis-tool__prediction-panel'>
                <h4>
                    <Localize i18n_default_text='Last digit prediction' />
                </h4>
                <div className='analysis-tool__digits'>
                    {digitCounts.map((_, digit) => {
                        const pct = percentages[digit];
                        const isSelected = selectedDigit === digit;
                        const isMax = total > 0 && digit === maxIndex;
                        const isMin = total > 0 && digit === minIndex && minIndex !== maxIndex;
                        return (
                            <button
                                type='button'
                                key={digit}
                                className={[
                                    'analysis-tool__digit',
                                    isSelected ? 'analysis-tool__digit--selected' : '',
                                ].join(' ')}
                                onClick={() => setSelectedDigit(prev => (prev === digit ? null : digit))}
                            >
                                <span className='analysis-tool__digit-value'>{digit}</span>
                                <span
                                    className={[
                                        'analysis-tool__digit-pct',
                                        isMax ? 'analysis-tool__digit-pct--max' : '',
                                        isMin ? 'analysis-tool__digit-pct--min' : '',
                                    ].join(' ')}
                                >
                                    {total ? `${pct.toFixed(1)}%` : '—'}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default AnalysisTool;
