import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { Localize } from '@deriv-com/translations';
import { Text } from '@deriv-com/ui';
import './dtrader-iframe.scss';

const DTRADER_URL = 'https://dtraderkenya.netlify.app';

const DTraderIframe: React.FC = observer(() => {
    const { client } = useStore() ?? {};
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Listen for messages from the iframe
        const handleMessage = (event: MessageEvent) => {
            // Verify origin
            if (event.origin !== new URL(DTRADER_URL).origin) return;

            // Handle different message types from dtrader
            if (event.data.type === 'DTRADER_READY') {
                setIsLoading(false);
            }

            if (event.data.type === 'DTRADER_ERROR') {
                setError(event.data.message);
            }
        };

        window.addEventListener('message', handleMessage);
        
        // Timeout for loading
        const timeout = setTimeout(() => {
            if (isLoading) {
                setIsLoading(false);
            }
        }, 10000);

        return () => {
            window.removeEventListener('message', handleMessage);
            clearTimeout(timeout);
        };
    }, [isLoading]);

    // Build iframe src with auth params if logged in
    const getIframeSrc = () => {
        const params = new URLSearchParams();
        
        // Pass account info to dtrader if available
        if (client?.is_logged_in && client?.currency) {
            params.set('currency', client.currency);
        }
        
        return `${DTRADER_URL}?${params.toString()}`;
    };

    return (
        <div className='dtrader-iframe'>
            <div className='dtrader-iframe__header'>
                <h2 className='dtrader-iframe__title'>
                    <Localize i18n_default_text='DTrader Pro' />
                </h2>
                <Text size='sm' color='secondary'>
                    <Localize i18n_default_text='Powered by Deriv API' />
                </Text>
            </div>

            <div className='dtrader-iframe__container'>
                {isLoading && (
                    <div className='dtrader-iframe__loading'>
                        <div className='dtrader-iframe__spinner' />
                        <Text size='sm'>
                            <Localize i18n_default_text='Loading DTrader...' />
                        </Text>
                    </div>
                )}

                {error && (
                    <div className='dtrader-iframe__error'>
                        <Text size='sm' color='error'>
                            {error}
                        </Text>
                    </div>
                )}

                <iframe
                    src={getIframeSrc()}
                    className='dtrader-iframe__frame'
                    title='DTrader Pro'
                    allow='fullscreen'
                    sandbox='allow-same-origin allow-scripts allow-popups allow-forms allow-storage-access-by-user-activation'
                    onLoad={() => setIsLoading(false)}
                />
            </div>

            {!client?.is_logged_in && (
                <div className='dtrader-iframe__login-banner'>
                    <Text size='sm'>
                        <Localize i18n_default_text='Please log in to trade. Your session will be shared with DTrader.' />
                    </Text>
                </div>
            )}
        </div>
    );
});

export default DTraderIframe;
