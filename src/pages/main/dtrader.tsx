import React, { useEffect, useRef, useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { Localize } from '@deriv-com/translations';
import { Button, Text, Dropdown } from '@deriv-com/ui';
import './dtrader.scss';

// Available markets
const MARKETS = [
    { value: 'R_100', text: 'Volatility 100 Index', category: 'synthetic' },
    { value: 'R_50', text: 'Volatility 50 Index', category: 'synthetic' },
    { value: 'R_25', text: 'Volatility 25 Index', category: 'synthetic' },
    { value: 'R_10', text: 'Volatility 10 Index', category: 'synthetic' },
    { value: '1HZ100V', text: 'Volatility 100 (1s) Index', category: 'synthetic' },
    { value: '1HZ50V', text: 'Volatility 50 (1s) Index', category: 'synthetic' },
    { value: '1HZ25V', text: 'Volatility 25 (1s) Index', category: 'synthetic' },
    { value: '1HZ10V', text: 'Volatility 10 (1s) Index', category: 'synthetic' },
];

// Contract types
const CONTRACT_TYPES = [
    { value: 'CALL', text: 'Rise', color: '#22c55e' },
    { value: 'PUT', text: 'Fall', color: '#ef4444' },
];

// Duration units
const DURATION_UNITS = [
    { value: 't', text: 'Ticks' },
    { value: 's', text: 'Seconds' },
    { value: 'm', text: 'Minutes' },
    { value: 'h', text: 'Hours' },
    { value: 'd', text: 'Days' },
];

interface TProposal {
    proposal: {
        id: string;
        ask_price: number;
        payout: number;
        longcode: string;
    };
}

const DTrader: React.FC = observer(() => {
    const { client } = useStore() ?? {};
    const ws = useRef<WebSocket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [selectedMarket, setSelectedMarket] = useState('R_100');
    const [selectedContract, setSelectedContract] = useState('CALL');
    const [duration, setDuration] = useState(5);
    const [durationUnit, setDurationUnit] = useState('t');
    const [amount, setAmount] = useState(10);
    const [currentPrice, setCurrentPrice] = useState<number | null>(null);
    const [proposal, setProposal] = useState<TProposal | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tradeResult, setTradeResult] = useState<{ status: 'won' | 'lost'; profit: number } | null>(null);

    // Initialize WebSocket connection
    useEffect(() => {
        const appId = client?.getAppId?.() || '36325';
        const wsUrl = `wss://ws.binaryws.com/websockets/v3?app_id=${appId}`;
        
        ws.current = new WebSocket(wsUrl);
        
        ws.current.onopen = () => {
            setIsConnected(true);
            setError(null);
        };
        
        ws.current.onclose = () => {
            setIsConnected(false);
        };
        
        ws.current.onerror = () => {
            setError('Connection error. Please try again.');
        };
        
        ws.current.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.tick) {
                setCurrentPrice(data.tick.quote);
            }
            
            if (data.proposal) {
                setProposal(data);
                setIsLoading(false);
            }
            
            if (data.buy) {
                // Trade executed
                subscribeToContract(data.buy.contract_id);
            }
            
            if (data.proposal_open_contract) {
                const contract = data.proposal_open_contract;
                if (contract.is_sold) {
                    const profit = contract.profit;
                    setTradeResult({
                        status: profit > 0 ? 'won' : 'lost',
                        profit: profit
                    });
                }
            }
            
            if (data.error) {
                setError(data.error.message);
                setIsLoading(false);
            }
        };
        
        return () => {
            ws.current?.close();
        };
    }, [client]);

    // Subscribe to market ticks
    useEffect(() => {
        if (isConnected && selectedMarket) {
            ws.current?.send(JSON.stringify({
                ticks: selectedMarket,
                subscribe: 1
            }));
        }
        
        return () => {
            if (ws.current?.readyState === WebSocket.OPEN) {
                ws.current.send(JSON.stringify({
                    forget_all: 'ticks'
                }));
            }
        };
    }, [isConnected, selectedMarket]);

    // Request proposal when parameters change
    useEffect(() => {
        if (isConnected && selectedMarket && selectedContract) {
            requestProposal();
        }
    }, [isConnected, selectedMarket, selectedContract, duration, durationUnit, amount]);

    const requestProposal = useCallback(() => {
        if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
        
        setIsLoading(true);
        setProposal(null);
        
        ws.current.send(JSON.stringify({
            proposal: 1,
            subscribe: 0,
            amount: amount,
            basis: 'stake',
            contract_type: selectedContract,
            currency: client?.currency || 'USD',
            duration: duration,
            duration_unit: durationUnit,
            symbol: selectedMarket
        }));
    }, [amount, selectedContract, client?.currency, duration, durationUnit, selectedMarket]);

    const buyContract = useCallback(() => {
        if (!proposal || !ws.current || ws.current.readyState !== WebSocket.OPEN) return;
        
        setIsLoading(true);
        setTradeResult(null);
        
        ws.current.send(JSON.stringify({
            buy: proposal.proposal.id,
            price: proposal.proposal.ask_price
        }));
    }, [proposal]);

    const subscribeToContract = useCallback((contractId: string) => {
        ws.current?.send(JSON.stringify({
            proposal_open_contract: 1,
            contract_id: contractId,
            subscribe: 1
        }));
    }, []);

    return (
        <div className='dtrader'>
            <div className='dtrader__header'>
                <h2 className='dtrader__title'>
                    <Localize i18n_default_text='DTrader' />
                </h2>
                <div className={`dtrader__connection ${isConnected ? 'connected' : 'disconnected'}`}>
                    {isConnected ? 'Connected' : 'Disconnected'}
                </div>
            </div>
            
            <div className='dtrader__content'>
                {/* Market Price Display */}
                <div className='dtrader__price-display'>
                    <Text size='sm' color='secondary'>Current Price</Text>
                    <div className='dtrader__price'>
                        {currentPrice ? currentPrice.toFixed(2) : '--'}
                    </div>
                    <Text size='xs' color='secondary'>{selectedMarket}</Text>
                </div>
                
                {/* Trade Parameters */}
                <div className='dtrader__params'>
                    {/* Market Selector */}
                    <div className='dtrader__field'>
                        <label><Localize i18n_default_text='Market' /></label>
                        <select 
                            value={selectedMarket} 
                            onChange={(e) => setSelectedMarket(e.target.value)}
                            className='dtrader__select'
                        >
                            {MARKETS.map(market => (
                                <option key={market.value} value={market.value}>
                                    {market.text}
                                </option>
                            ))}
                        </select>
                    </div>
                    
                    {/* Contract Type */}
                    <div className='dtrader__field'>
                        <label><Localize i18n_default_text='Trade Type' /></label>
                        <div className='dtrader__contract-types'>
                            {CONTRACT_TYPES.map(contract => (
                                <button
                                    key={contract.value}
                                    className={`dtrader__contract-btn ${selectedContract === contract.value ? 'active' : ''}`}
                                    onClick={() => setSelectedContract(contract.value)}
                                    style={{ '--contract-color': contract.color } as React.CSSProperties}
                                >
                                    {contract.text}
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    {/* Duration */}
                    <div className='dtrader__field dtrader__field--row'>
                        <div className='dtrader__field-half'>
                            <label><Localize i18n_default_text='Duration' /></label>
                            <input
                                type='number'
                                value={duration}
                                onChange={(e) => setDuration(Number(e.target.value))}
                                min={1}
                                max={100}
                                className='dtrader__input'
                            />
                        </div>
                        <div className='dtrader__field-half'>
                            <label>&nbsp;</label>
                            <select 
                                value={durationUnit} 
                                onChange={(e) => setDurationUnit(e.target.value)}
                                className='dtrader__select'
                            >
                                {DURATION_UNITS.map(unit => (
                                    <option key={unit.value} value={unit.value}>
                                        {unit.text}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    
                    {/* Stake */}
                    <div className='dtrader__field'>
                        <label><Localize i18n_default_text='Stake ({currency})' /> {client?.currency || 'USD'}</label>
                        <input
                            type='number'
                            value={amount}
                            onChange={(e) => setAmount(Number(e.target.value))}
                            min={1}
                            max={100000}
                            className='dtrader__input'
                        />
                    </div>
                </div>
                
                {/* Proposal / Trade Button */}
                <div className='dtrader__trade-section'>
                    {proposal?.proposal && (
                        <div className='dtrader__proposal'>
                            <div className='dtrader__proposal-row'>
                                <span><Localize i18n_default_text='Payout' /></span>
                                <span className='dtrader__payout'>{proposal.proposal.payout}</span>
                            </div>
                            <div className='dtrader__proposal-row'>
                                <span><Localize i18n_default_text='Cost' /></span>
                                <span>{proposal.proposal.ask_price}</span>
                            </div>
                        </div>
                    )}
                    
                    {error && (
                        <div className='dtrader__error'>
                            {error}
                        </div>
                    )}
                    
                    {tradeResult && (
                        <div className={`dtrader__result ${tradeResult.status}`}>
                            <Localize i18n_default_text={tradeResult.status === 'won' ? 'You Won!' : 'You Lost'} />
                            <span className='dtrader__profit'>
                                {tradeResult.profit > 0 ? '+' : ''}{tradeResult.profit.toFixed(2)}
                            </span>
                        </div>
                    )}
                    
                    <Button
                        onClick={buyContract}
                        isLoading={isLoading}
                        disabled={!proposal || isLoading || !client?.is_logged_in}
                        className={`dtrader__trade-btn ${selectedContract}`}
                    >
                        {!client?.is_logged_in ? (
                            <Localize i18n_default_text='Login to Trade' />
                        ) : (
                            <>
                                <Localize i18n_default_text={selectedContract === 'CALL' ? 'Purchase Up' : 'Purchase Down'} />
                                {proposal?.proposal && (
                                    <span className='dtrader__btn-price'>{proposal.proposal.ask_price}</span>
                                )}
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
});

export default DTrader;
