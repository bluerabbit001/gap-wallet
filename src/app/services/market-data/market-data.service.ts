import { Injectable } from '@angular/core'
import { AirGapMarketWallet } from '@airgap/coinlib-core'
import BigNumber from 'bignumber.js'

import { AccountProvider } from '../account/account.provider'
import { SubProtocolSymbols } from '@airgap/coinlib-core'
import { TimeInterval } from '@airgap/coinlib-core/wallet/AirGapMarketWallet'
import { CryptoPrices, PriceService } from '../price/price.service'

export interface BalanceAtTimestamp {
  timestamp: number
  balance: number
  marketSymbol: string
}
export interface ValueAtTimestamp {
  timestamp: number
  usdValue: number
}

@Injectable()
export class MarketDataService {
  constructor(private readonly walletsProvider: AccountProvider, private readonly priceService: PriceService) {}

  public async fetchAllValues(interval: TimeInterval): Promise<ValueAtTimestamp[]> {
    return new Promise<ValueAtTimestamp[]>(async resolve => {
      const wallets = this.walletsProvider.getWalletList().filter(wallet => wallet.protocol.identifier !== SubProtocolSymbols.XTZ_USD)
      const marketSymbols = Array.from(new Set(wallets.map(wallet => wallet.protocol.marketSymbol)))

      const cryptoPrices: CryptoPrices[] = await this.priceService.fetchPriceData(marketSymbols, interval)

      const relevantTimestamps: number[] = Array.from(new Set(cryptoPrices.map(priceObject => priceObject.time)))

      const balanceByTimestampAllWallets: BalanceAtTimestamp[][] = await Promise.all(
        wallets.map(wallet => this.walletBalancesAtTimestamps(wallet, relevantTimestamps))
      )

      const valuesByTimestampAllWallets: ValueAtTimestamp[][] = balanceByTimestampAllWallets.map(balanceByTimestampSingleWallet => {
        return balanceByTimestampSingleWallet.map((balanceObject, index) => {
          const cryptoPricesByProtocol = cryptoPrices.filter(price => price.baseCurrencySymbol === balanceObject.marketSymbol.toUpperCase())
          return {
            usdValue: cryptoPricesByProtocol[index] ? balanceObject.balance * cryptoPricesByProtocol[index].price : 0,
            timestamp: balanceObject.timestamp
          }
        })
      })

      const aggregatedValuesByTimestamp = valuesByTimestampAllWallets.reduce(
        (valuesByTimestamp: ValueAtTimestamp[], next: ValueAtTimestamp[]) =>
          next.map((valueAtTimestamp: ValueAtTimestamp, i) => {
            return {
              usdValue: new BigNumber(valuesByTimestamp[i].usdValue).plus(valueAtTimestamp.usdValue).toNumber(),
              timestamp: valueAtTimestamp.timestamp
            }
          })
      )
      resolve(aggregatedValuesByTimestamp)
    })
  }

  private async walletBalancesAtTimestamps(wallet: AirGapMarketWallet, timestamps: number[]): Promise<BalanceAtTimestamp[]> {
    if (!timestamps.length) {
      return []
    }

    let balance: BigNumber = await wallet.balanceOf()

    const transactionResult = await this.priceService.fetchTransactions(wallet).catch(error => {
      console.error(error)
      return {
        transactions: []
      }
    })
    const relevantTransactions = transactionResult.transactions.filter(
      transaction => transaction.timestamp && timestamps.length && transaction.timestamp > new BigNumber(timestamps[0]).div(1000).toNumber()
    )

    return timestamps
      .reverse()
      .map((timestamp, index, array) => {
        // check if there was a tx in between consecutive timestamps
        const newTransactions = relevantTransactions.filter(transaction =>
          transaction.timestamp && transaction.timestamp < new BigNumber(timestamp).div(1000).toNumber() && array[index + 1]
            ? transaction.timestamp > new BigNumber(array[index + 1]).div(1000).toNumber()
            : false
        )

        if (!newTransactions.length) {
          return {
            timestamp: new BigNumber(timestamp).dividedBy(1000).toNumber(),
            marketSymbol: wallet.protocol.marketSymbol,
            balance: balance.shiftedBy(wallet.protocol.decimals * -1).toNumber()
          }
        } else {
          balance = balance.minus(
            newTransactions
              .map(transaction => {
                const selfTx = transaction.to[0] === transaction.from[0]
                if (selfTx) {
                  return new BigNumber(0)
                } else if (transaction.isInbound) {
                  return new BigNumber(transaction.amount)
                } else {
                  return new BigNumber(transaction.amount).plus(transaction.fee).times(-1)
                }
              })
              .reduce((a, b) => a.plus(b))
          )

          return {
            timestamp: new BigNumber(timestamp).dividedBy(1000).toNumber(),
            marketSymbol: wallet.protocol.marketSymbol,
            balance: balance.shiftedBy(wallet.protocol.decimals * -1).toNumber()
          }
        }
      })
      .reverse()
  }
}
