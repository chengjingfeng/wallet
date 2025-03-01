import './Collectibles.scss'

import { NavLink } from 'react-router-dom'
import CollectiblesPlaceholder from './CollectiblesPlaceholder/CollectiblesPlaceholder'

const Collectibles = ({ collectibles }) => {
    return (
        !collectibles.length ?
            <CollectiblesPlaceholder/>
            :
            <div id="collectibles">
                {
                    collectibles.map(({ tokens }) => tokens.map(({ network, address, collectionName, collectionImg, assets }) => assets.map(({ tokenId, assetName, assetImg, balanceUSD }) => (
                        <div className="collectible" key={tokenId}>
                            <NavLink to={`/wallet/nft/${network}/${address}/${tokenId}`}>
                                <div className="artwork" style={{backgroundImage: `url(${assetImg})`}}/>
                                <div className="info">
                                    <div className="collection">
                                        <div className="collection-icon" style={{backgroundImage: `url(${collectionImg})`}}></div>
                                        <span className="collection-name">{ collectionName }</span>
                                    </div>
                                    <div className="details">
                                        <div className="name">{ assetName }</div>
                                        <div className="value"><span className="purple-highlight">$</span> { balanceUSD.toFixed(2) }</div>
                                    </div>
                                </div>
                            </NavLink>
                        </div>
                    ))))
                }
            </div>
    )
}

export default Collectibles