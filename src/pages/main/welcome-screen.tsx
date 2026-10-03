import React from 'react';
import { Localize } from '@deriv-com/translations';
import './welcome-screen.scss';

type TWelcomeScreenProps = {
    onContinue: () => void;
};

const WelcomeScreen: React.FC<TWelcomeScreenProps> = ({ onContinue }) => (
    <main className='welcome-screen'>
        <div className='welcome-screen__content'>
            <span className='welcome-screen__eyebrow'>THEEBAGG.SITE</span>
            <h1><Localize i18n_default_text='Welcome to The Bag.' /></h1>
            <p>
                <Localize i18n_default_text='Your all-in-one workspace for automated trading, smart bots, and real-time market insights.' />
            </p>
            <button type='button' className='welcome-screen__continue' onClick={onContinue}>
                <Localize i18n_default_text='Enter The Bag' />
                <span aria-hidden='true'>-&gt;</span>
            </button>
        </div>
    </main>
);

export default WelcomeScreen;