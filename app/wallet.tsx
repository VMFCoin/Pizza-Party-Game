'use client';
import React from 'react';
import { useAccount } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { Button } from './components/ui/button';

export default function WalletButton() {
  const { address, isConnected } = useAccount();
  const { open } = useAppKit();

  return (
    <Button onClick={() => open()}>
      {isConnected ? (
        <>{String(address).slice(0, 6)}...{String(address).slice(-4)}</>
      ) : (
        <>CONNECT WALLET</>
      )}
    </Button>
  );
}