import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { Localize } from '@deriv-com/translations';
import { Button, Text } from '@deriv-com/ui';
import './dtrader-iframe.scss';

const DTRADER_URL = 'https://dtraderkenya.netlify.app';

const DTraderIframe: React.FC = observer(() => {
    const { client } = useStore() ?? {};

    const openDTrader = () => {
        const params = new URLSearchParams();
        
        // Pass account info to dtrader if available
        if (client?.is_logged_in && client?.currency) {
            params.set('currency', client.currency);
        }
        
        const url = `${DTRADER_URL}?${params.toString()}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    return (
        <div className='dtrader-launcher'>
            <div className='dtrader-launcher__content'>
                <div className='dtrader-launcher__icon'>
                    <svg width='64' height='64' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
                        <path d='M4 19V5' stroke='currentColor' strokeWidth='2' strokeLinecap='round' />
                        <path d='M4 19H20' stroke='currentColor' strokeWidth='2' strokeLinecap='round' />
                        <path d='M6.5 15L10 11L13 14L18 8.5' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' />
                        <circle cx='10' cy='11' r='1.5' fill='currentColor' />
                        <circle cx='13' cy='14' r='1.5' fill='currentColor' opacity='0.7' />
                        <circle cx='18' cy='8.5' r='1.5' fill='currentColor' />
                    </svg>
                </div>
                
                <h2 className='dtrader-launcher__title'>
                    <Localize i18n_default_text='DTrader Pro' />
                </h2>
                
                <Text size='md' color='secondary' className='dtrader-launcher__description'>
                    <Localize i18n_default_text='Advanced trading platform with real-time charts and professional trading tools' />
                </Text>

                {!client?.is_logged_in && (
                    <Text size='sm' color='error' className='dtrader-launcher__warning'>
                        <Localize i18n_default_text='Please log in to your Deriv account to trade' />
                    </Text>
                )}

                <Button 
                    onClick={openDTrader}
                    size='lg'
                    className='dtrader-launcher__button'
                >
                    <Localize i18n_default_text='Launch DTrader' />
                </Button>

                <Text size='xs' color='secondary' className='dtrader-launcher__note'>
                    <Localize i18n_default_text='Opens in a new tab' />
                </Text>
            </div>
        </div>
    );
});

export default DTraderIframe;
