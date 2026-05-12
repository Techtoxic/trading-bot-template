/**
 * Simple Copy Trading Service
 * Mirrors demo trades to real account when copy trading is enabled
 */

export interface TradeSignal {
    trade_id: string;
    symbol: string;
    action: 'buy' | 'sell';
    amount: number;
    duration: number;
    duration_unit: 't' | 's' | 'm' | 'h' | 'd';
    basis: 'stake' | 'payout';
    contract_type: string;
    timestamp: number;
}

class SimpleCopyTradingService {
    private isEnabled = false;
    private realAccountBalance = 0;
    private tradeListeners: ((signal: TradeSignal) => void)[] = [];
    private apiHelpers: any = null;

    /**
     * Enable copy trading
     */
    enableCopyTrading(realBalance: number): void {
        this.isEnabled = true;
        this.realAccountBalance = realBalance;
        console.log('Copy trading enabled with real account balance:', realBalance);
    }

    /**
     * Disable copy trading
     */
    disableCopyTrading(): void {
        this.isEnabled = false;
        console.log('Copy trading disabled');
    }

    /**
     * Check if copy trading is enabled
     */
    isCopyTradingEnabled(): boolean {
        return this.isEnabled && this.realAccountBalance > 0;
    }

    /**
     * Update real account balance
     */
    updateRealAccountBalance(balance: number): void {
        this.realAccountBalance = balance;
        console.log('Real account balance updated:', balance);
    }

    /**
     * Set API helpers for placing real trades
     */
    setApiHelpers(apiHelpers: any): void {
        this.apiHelpers = apiHelpers;
        console.log('API helpers set for copy trading service');
    }

    /**
     * Process a demo trade and mirror it to real account if enabled
     */
    processDemoTrade(tradeData: any): void {
        if (!this.isCopyTradingEnabled()) {
            return;
        }

        // Extract trade information from demo trade
        const signal: TradeSignal = {
            trade_id: tradeData.trade_id || tradeData.id || `copy_${Date.now()}`,
            symbol: tradeData.symbol || 'R_10',
            action: tradeData.action || (tradeData.buy_price ? 'buy' : 'sell'),
            amount: tradeData.amount || tradeData.stake || 10,
            duration: tradeData.duration || 5,
            duration_unit: tradeData.duration_unit || 't',
            basis: tradeData.basis || 'stake',
            contract_type: tradeData.contract_type || 'CALL',
            timestamp: Date.now(),
        };

        console.log('Demo trade detected, mirroring to real account:', signal);

        // Notify listeners about the trade signal
        this.tradeListeners.forEach(listener => listener(signal));

        // In a real implementation, this would place the trade on the real account
        // using the Deriv API
        this.placeRealAccountTrade(signal);
    }

    /**
     * Place trade on real account using Deriv API
     */
    private async placeRealAccountTrade(signal: TradeSignal): Promise<void> {
        if (!this.apiHelpers) {
            console.error('Copy trading: API helpers not available');
            return;
        }

        try {
            console.log('Placing trade on real account:', {
                symbol: signal.symbol,
                action: signal.action,
                amount: signal.amount,
                duration: signal.duration,
                contract_type: signal.contract_type,
            });

            // Prepare trade parameters for Deriv API
            const tradeParams = {
                proposal: 1,
                amount: signal.amount,
                basis: signal.basis,
                contract_type: signal.contract_type,
                currency: 'USD',
                duration: signal.duration,
                duration_unit: signal.duration_unit,
                symbol: signal.symbol,
            };

            // Place the trade using Deriv API
            const result = await this.apiHelpers.buy(tradeParams);

            if (result && result.buy) {
                console.log('Copy trading: Real trade placed successfully:', result.buy);

                // Update balance after successful trade
                this.realAccountBalance -= signal.amount;
            } else {
                console.error('Copy trading: Failed to place real trade:', result);
            }
        } catch (error) {
            console.error('Copy trading: Error placing real trade:', error);
        }
    }

    /**
     * Subscribe to trade signals
     */
    onTradeSignal(callback: (signal: TradeSignal) => void): void {
        this.tradeListeners.push(callback);
    }

    /**
     * Unsubscribe from trade signals
     */
    offTradeSignal(callback: (signal: TradeSignal) => void): void {
        this.tradeListeners = this.tradeListeners.filter(listener => listener !== callback);
    }

    /**
     * Get current status
     */
    getStatus(): { enabled: boolean; realBalance: number } {
        return {
            enabled: this.isEnabled,
            realBalance: this.realAccountBalance,
        };
    }
}

// Export singleton instance
export const simpleCopyTradingService = new SimpleCopyTradingService();
export default simpleCopyTradingService;
