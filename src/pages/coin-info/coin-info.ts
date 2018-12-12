import { Component } from '@angular/core'
import { IAirGapTransaction, AirGapMarketWallet } from 'airgap-coin-lib'
import { Platform, NavController, NavParams, PopoverController } from 'ionic-angular'

import { TransactionDetailPage } from '../transaction-detail/transaction-detail'
import { TransactionPreparePage } from '../transaction-prepare/transaction-prepare'
import { WalletAddressPage } from '../wallet-address/wallet-address'
import { WalletEditPopoverComponent } from '../../components/wallet-edit-popover/wallet-edit-popover.component'
import { WalletsProvider } from '../../providers/wallets/wallets.provider'
import { HttpClient } from '@angular/common/http'
import { BigNumber } from 'bignumber.js'
import { SettingsProvider } from '../../providers/settings/settings'

declare let cordova

@Component({
  selector: 'page-coin-info',
  templateUrl: 'coin-info.html'
})
export class CoinInfoPage {
  private _isRefreshing: boolean = false
  private refreshStarted: Date
  set isRefreshing(refreshing) {
    if (!this._isRefreshing && refreshing) {
      this.refreshStarted = new Date()
      this.showLoader = true
    }
    if (this._isRefreshing && !refreshing) {
      if (this.refreshStarted.getTime() + this.MIN_LOADING_TIME < new Date().getTime()) {
        this.showLoader = false
      } else {
        setTimeout(() => {
          this.showLoader = false
        }, this.MIN_LOADING_TIME + this.refreshStarted.getTime() - new Date().getTime())
      }
    }
    this._isRefreshing = refreshing
  }

  showLoader = false
  infiniteEnabled = false
  txOffset: number = 0
  wallet: AirGapMarketWallet
  transactions: IAirGapTransaction[] = []

  protocolIdentifier: string
  aeTxEnabled: boolean = false
  aeTxListEnabled: boolean = false
  aeMigratedTokens: BigNumber = new BigNumber(0)
  aeCurrentPhase: string = ''
  aePhaseEnd: string = ''

  lottieConfig = {
    path: '/assets/animations/loading.json'
  }

  private TRANSACTION_LIMIT = 10
  private MIN_LOADING_TIME: number = 3000

  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
    public popoverCtrl: PopoverController,
    public walletProvider: WalletsProvider,
    public http: HttpClient,
    private platform: Platform,
    private settingsProvider: SettingsProvider
  ) {
    this.wallet = this.navParams.get('wallet')
    this.protocolIdentifier = this.wallet.coinProtocol.identifier
    if (this.protocolIdentifier === 'ae') {
      this.http
        .get(`https://api-airgap.gke.papers.tech/api/v1/protocol/ae/migrations/pending/${this.wallet.addresses[0]}`)
        .subscribe((result: any) => {
          this.aeMigratedTokens = new BigNumber(result.phase.balance)
          this.aeCurrentPhase = result.phase.name
          this.aePhaseEnd = result.phase.endTimestamp
        })
    }
  }

  /**
   * This is the "small" banner on top of the transaction.
   * This should be shown if the user has balance on mainnet,
   * but also balance on the next migration phase.
   */
  showAeMigrationBanner() {
    return this.walletIsAe() && (this.wallet.currentBalance.gt(0) || this.transactions.length > 0) && this.aeMigratedTokens.gt(0)
  }

  /**
   * This is the full page screen informing the user about token migration
   * It should be shown when the user has migration balance, but no mainnet balance.
   */
  showAeMigrationScreen() {
    return this.walletIsAe() && (this.wallet.currentBalance.eq(0) && this.transactions.length === 0) && this.aeMigratedTokens.gt(0)
  }

  showNoTransactionScreen() {
    return this.transactions.length === 0 && !this.showAeMigrationScreen()
  }

  walletIsAe() {
    return this.wallet.protocolIdentifier === 'ae'
  }

  ionViewWillEnter() {
    this.doRefresh()
  }

  openPreparePage() {
    this.navCtrl.push(TransactionPreparePage, {
      wallet: this.wallet
    })
  }

  openReceivePage() {
    this.navCtrl.push(WalletAddressPage, {
      wallet: this.wallet
    })
  }

  openTransactionDetailPage(transaction: IAirGapTransaction) {
    this.navCtrl.push(TransactionDetailPage, {
      transaction: transaction
    })
  }

  openBlockexplorer() {
    this.openUrl(`https://explorer.aepps.com/#/account/${this.wallet.addresses[0]}`)
  }

  private openUrl(url: string) {
    if (this.platform.is('ios') || this.platform.is('android')) {
      cordova.InAppBrowser.open(url, '_system', 'location=true')
    } else {
      window.open(url, '_blank')
    }
  }

  doRefresh(refresher: any = null) {
    if (refresher) {
      refresher.complete()
    }

    this.isRefreshing = true

    // this can safely be removed after AE has made the switch to mainnet
    if (this.protocolIdentifier === 'ae') {
      this.http.get('https://api-airgap.gke.papers.tech/status').subscribe((result: any) => {
        this.aeTxEnabled = result.transactionsEnabled
        this.aeTxListEnabled = result.txListEnabled
        if (this.aeTxListEnabled) {
          this.loadInitialTransactions()
        } else {
          this.transactions = []
          this.isRefreshing = false
        }
      })
    } else {
      this.loadInitialTransactions()
    }
  }

  async doInfinite(infiniteScroll) {
    if (!this.infiniteEnabled) {
      return infiniteScroll.complete()
    }

    // TODO: If coinlib is updated, we need to remove `+ this.TRANSACTION_LIMIT`
    const offset = this.txOffset + this.TRANSACTION_LIMIT - (this.txOffset % this.TRANSACTION_LIMIT)
    const newTransactions = await this.getTransactions(this.TRANSACTION_LIMIT, offset)

    this.transactions = this.mergeTransactions(this.transactions, newTransactions)
    this.txOffset = this.transactions.length

    await this.settingsProvider.setCache<IAirGapTransaction[]>(this.getWalletIdentifier(), this.transactions)

    if (newTransactions.length < this.TRANSACTION_LIMIT) {
      this.infiniteEnabled = false
    }

    infiniteScroll.complete()
  }

  async loadInitialTransactions(): Promise<void> {
    if (this.transactions.length === 0) {
      this.transactions = await this.settingsProvider.getCache<IAirGapTransaction[]>(this.getWalletIdentifier())
    }

    const transactions = await this.getTransactions()

    this.transactions = this.mergeTransactions(this.transactions, transactions)

    this.isRefreshing = false
    this.walletProvider.triggerWalletChanged()

    await this.settingsProvider.setCache<IAirGapTransaction[]>(this.getWalletIdentifier(), this.transactions)

    this.txOffset = this.transactions.length
    this.infiniteEnabled = true
  }

  async getTransactions(limit: number = 10, offset: number = 0): Promise<IAirGapTransaction[]> {
    const results = await Promise.all([this.wallet.fetchTransactions(limit, offset), this.wallet.synchronize()])
    return results[0]
  }

  mergeTransactions(oldTransactions, newTransactions): IAirGapTransaction[] {
    if (!oldTransactions) {
      return newTransactions
    }
    let transactionMap = new Map<string, IAirGapTransaction>(
      oldTransactions.map((tx: IAirGapTransaction): [string, IAirGapTransaction] => [tx.hash, tx])
    )

    newTransactions.forEach(tx => {
      transactionMap.set(tx.hash, tx)
    })

    return Array.from(transactionMap.values()).sort((a, b) => b.timestamp - a.timestamp)
  }

  getWalletIdentifier(): string {
    return `${this.wallet.protocolIdentifier}-${this.wallet.publicKey}`
  }

  presentEditPopover(event) {
    let popover = this.popoverCtrl.create(WalletEditPopoverComponent, {
      wallet: this.wallet,
      onDelete: () => {
        this.navCtrl.pop()
      }
    })
    popover.present({
      ev: event
    })
  }
}
