import { useCallback, useEffect, useRef, useState } from 'react';

import { ZAPPER_API_KEY } from '../config';
import { fetchGet } from '../lib/fetch';
import { ZAPPER_API_ENDPOINT } from '../config'
import supportedProtocols from '../consts/supportedProtocols';
import { useToasts } from '../hooks/toasts'
import { setKnownAddresses, setKnownTokens } from '../lib/humanReadableTransactions';
import { VELCRO_API_ENDPOINT } from '../config'

const getBalances = (apiKey, network, protocol, address, provider) => fetchGet(`${provider === 'velcro' ? VELCRO_API_ENDPOINT : ZAPPER_API_ENDPOINT}/protocols/${protocol}/balances?addresses[]=${address}&network=${network}&api_key=${apiKey}&newBalances=true`)

let hidden, visibilityChange;
if (typeof document.hidden !== 'undefined') {
    hidden = 'hidden';
    visibilityChange = 'visibilitychange';
} else if (typeof document.msHidden !== 'undefined') {
    hidden = 'msHidden';
    visibilityChange = 'msvisibilitychange';
} else if (typeof document.webkitHidden !== 'undefined') {
    hidden = 'webkitHidden';
    visibilityChange = 'webkitvisibilitychange';
}
let lastOtherProcolsRefresh = null

export default function usePortfolio({ currentNetwork, account }) {
    const { addToast } = useToasts()

    const currentAccount = useRef();
    const [isBalanceLoading, setBalanceLoading] = useState(true);
    const [areProtocolsLoading, setProtocolsLoading] = useState(true);

    const [tokensByNetworks, setTokensByNetworks] = useState([])
    const [otherProtocolsByNetworks, setOtherProtocolsByNetworks] = useState([])

    const [balance, setBalance] = useState({
        total: {
            full: 0,
            truncated: 0,
            decimals: '00'
        },
        tokens: []
    });
    const [otherBalances, setOtherBalances] = useState([]);
    const [tokens, setTokens] = useState([]);
    const [protocols, setProtocols] = useState([]);
    const [collectibles, setCollectibles] = useState([]);

    const fetchTokens = useCallback(async (account, currentNetwork = false) => {
        try {
            const networks = currentNetwork ? [supportedProtocols.find(({ network }) => network === currentNetwork)] : supportedProtocols

            let failedRequests = 0
            const requestsCount = networks.length

            const updatedTokens = (await Promise.all(networks.map(async ({ network, balancesProvider }) => {
                try {
                    const balance = await getBalances(ZAPPER_API_KEY, network, 'tokens', account, balancesProvider)
                    if (!balance) return null

                    const { meta, products } = Object.values(balance)[0]
                    return {
                        network,
                        meta,
                        products
                    }
                } catch(e) {
                    console.error('Balances API error', e)
                    failedRequests++
                }
            }))).filter(data => data)
            const updatedNetworks = updatedTokens.map(({ network }) => network)

            // Prevent race conditions
            if (currentAccount.current !== account) return

            setTokensByNetworks(tokensByNetworks => ([
                ...tokensByNetworks.filter(({ network }) => !updatedNetworks.includes(network)),
                ...updatedTokens
            ]))

            if (failedRequests >= requestsCount) throw new Error('Failed to fetch Tokens from API')
            return true
        } catch (error) {
            console.error(error)
            addToast(error.message, { error: true })
            return false
        }
    }, [addToast])

    const fetchOtherProtocols = useCallback(async (account, currentNetwork = false) => {
        try {
            const protocols = currentNetwork ? [supportedProtocols.find(({ network }) => network === currentNetwork)] : supportedProtocols

            let failedRequests = 0
            const requestsCount = protocols.reduce((acc, curr) => curr.protocols.length + acc, 0)

            const updatedProtocols = (await Promise.all(protocols.map(async ({ network, protocols }) => {
                const all = (await Promise.all(protocols.map(async protocol => {
                    try {
                        const balance = await getBalances(ZAPPER_API_KEY, network, protocol, account)
                        return balance ? Object.values(balance)[0] : null
                    } catch(_) {
                        failedRequests++
                    }
                }))).filter(data => data).flat()

                return all.length ? {
                    network,
                    protocols: all.map(({ products }) => products).flat(2)
                } : null
            }))).filter(data => data)
            const updatedNetworks = updatedProtocols.map(({ network }) => network)

            // Prevent race conditions
            if (currentAccount.current !== account) return

            setOtherProtocolsByNetworks(protocolsByNetworks => ([
                ...protocolsByNetworks.filter(({ network }) => !updatedNetworks.includes(network)),
                ...updatedProtocols
            ]))
            
            lastOtherProcolsRefresh = Date.now()

            if (failedRequests >= requestsCount) throw new Error('Failed to fetch other Protocols from API')
            return true
        } catch (error) {
            console.error(error)
            addToast(error.message, { error: true })
            return false
        }
    }, [addToast])

    const refreshTokensIfVisible = useCallback(() => {
        if (!account) return
        if (!document[hidden] && !isBalanceLoading) fetchTokens(account, currentNetwork)
    }, [isBalanceLoading, account, fetchTokens, currentNetwork])

    const requestOtherProtocolsRefresh = async () => {
        if (!account) return
        if ((Date.now() - lastOtherProcolsRefresh) > 30000 && !areProtocolsLoading) await fetchOtherProtocols(account, currentNetwork)
    }

    // Make humanizer 'learn' about new tokens and aliases
    const updateHumanizerData = tokensByNetworks => {
        const tokensList = Object.values(tokensByNetworks).map(({ products }) => products.map(({ assets }) => assets.map(({ tokens }) => tokens.map(token => token)))).flat(3)
        const knownAliases = tokensList.map(({ address, symbol }) => ({ address, name: symbol}))
        setKnownAddresses(knownAliases)
        setKnownTokens(tokensList)
    }

    // Fetch balances and protocols on account change
    useEffect(() => {
        currentAccount.current = account

        async function loadBalance() {
            if (!account) return
            setBalanceLoading(true)
            if (await fetchTokens(account)) setBalanceLoading(false)
        }

        async function loadProtocols() {
            if (!account) return
            setProtocolsLoading(true)
            if (await fetchOtherProtocols(account)) setProtocolsLoading(false)
        }

        loadBalance()
        loadProtocols()
    }, [account, fetchTokens, fetchOtherProtocols])

    // Update states on network, tokens and ohterProtocols change
    useEffect(() => {
        try {
            const balanceByNetworks = tokensByNetworks.map(({ network, meta }) => {
                const balanceUSD = meta.find(({ label }) => label === 'Total')?.value + meta.find(({ label }) => label === 'Debt')?.value
                if (!balanceUSD) return {
                    network,
                    total: {
                        full: 0,
                        truncated: 0,
                        decimals: '00'
                    }
                }

                const [truncated, decimals] = Number(balanceUSD.toString()).toFixed(2).split('.')
                return {
                    network,
                    total: {
                        full: balanceUSD,
                        truncated: Number(truncated).toLocaleString('en-US'),
                        decimals
                    }
                }
            })

            const balance = balanceByNetworks.find(({ network }) => network === currentNetwork)
            if (balance) {
                setBalance(balance)
                setOtherBalances(balanceByNetworks.filter(({ network }) => network !== currentNetwork))
            }

            updateHumanizerData(tokensByNetworks)

            const tokens = tokensByNetworks.find(({ network }) => network === currentNetwork)
            if (tokens) setTokens(tokens.products.map(({ assets }) => assets.map(({ tokens }) => tokens)).flat(2))

            const otherProtocols = otherProtocolsByNetworks.find(({ network }) => network === currentNetwork)
            if (tokens && otherProtocols) {
                setProtocols([
                    ...tokens.products,
                    ...otherProtocols.protocols.filter(({ label }) => label !== 'NFTs')
                ])
                setCollectibles(otherProtocols.protocols.find(({ label }) => label === 'NFTs')?.assets || [])
            }
        } catch(e) {
            console.error(e);
            addToast(e.message | e, { error: true })
        }
    }, [currentNetwork, tokensByNetworks, otherProtocolsByNetworks, addToast])

    // Refresh tokens on network change
    useEffect(() => {
        refreshTokensIfVisible()
    }, [currentNetwork, refreshTokensIfVisible])

    // Refresh balance every 45s if visible
    useEffect(() => {
        const refreshInterval = setInterval(refreshTokensIfVisible, 45000)
        return () => clearInterval(refreshInterval)
    }, [refreshTokensIfVisible])

    // Refresh balance every 150s if hidden
    useEffect(() => {
        const refreshIfHidden = () => document[hidden] && !isBalanceLoading ? fetchTokens(account, currentNetwork) : null
        const refreshInterval = setInterval(refreshIfHidden, 150000)
        return () => clearInterval(refreshInterval)
    }, [account, currentNetwork, isBalanceLoading, fetchTokens])

    // Refresh balance when window is focused
    useEffect(() => {
        document.addEventListener(visibilityChange, refreshTokensIfVisible, false);
        return () => document.removeEventListener(visibilityChange, refreshTokensIfVisible, false);
    }, [refreshTokensIfVisible])

    return {
        isBalanceLoading,
        areProtocolsLoading,
        balance,
        otherBalances,
        tokens,
        protocols,
        collectibles,
        requestOtherProtocolsRefresh
        //updatePortfolio//TODO find a non dirty way to be able to reply to getSafeBalances from the dapps, after the first refresh
    }
}
