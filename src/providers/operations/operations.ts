import { Injectable } from '@angular/core'
import {
  AirGapMarketWallet,
  TezosKtProtocol,
  SyncProtocolUtils,
  EncodedType,
  DelegationInfo,
  IAirGapTransaction,
  TezosProtocol
} from 'airgap-coin-lib'
import { InteractionSelectionPage } from '../../pages/interaction-selection/interaction-selection'
import { RawTezosTransaction } from 'airgap-coin-lib/dist/serializer/unsigned-transactions/tezos-transactions.serializer'
import { RawEthereumTransaction } from 'airgap-coin-lib/dist/serializer/unsigned-transactions/ethereum-transactions.serializer'
import { RawBitcoinTransaction } from 'airgap-coin-lib/dist/serializer/unsigned-transactions/bitcoin-transactions.serializer'
import { RawAeternityTransaction } from 'airgap-coin-lib/dist/serializer/unsigned-transactions/aeternity-transactions.serializer'
import { LoadingController, Loading, ToastController } from 'ionic-angular'
import { handleErrorSentry, ErrorCategory } from '../sentry-error-handler/sentry-error-handler'
import { BehaviorSubject } from 'rxjs'
import { map } from 'rxjs/operators'
import BigNumber from 'bignumber.js'

export enum ActionType {
  IMPORT_ACCOUNT,
  ADD_TOKEN,
  DELEGATE
}

@Injectable()
export class OperationsProvider {
  private delegationStatuses: BehaviorSubject<Map<string, boolean>> = new BehaviorSubject(new Map())

  constructor(private readonly loadingController: LoadingController, private readonly toastController: ToastController) {}

  public setDelegationStatusOfAddress(address: string, delegated: boolean) {
    this.delegationStatuses.next(this.delegationStatuses.getValue().set(address, delegated))
  }

  public async getDelegationStatusOfAddress(address: string, refresh: boolean = false) {
    const delegationStatus = this.delegationStatuses.getValue().get(address)
    if (refresh || delegationStatus === undefined) {
      const { isDelegated } = await this.checkDelegated(address)
      this.setDelegationStatusOfAddress(address, isDelegated)
      return isDelegated
    } else {
      return delegationStatus
    }
  }

  public async getDelegationStatusObservableOfAddress(address) {
    await this.getDelegationStatusOfAddress(address)
    return this.delegationStatuses.pipe(map(delegationStatuses => delegationStatuses.get(address)))
  }

  public refreshAllDelegationStatuses() {
    Array.from(this.delegationStatuses.getValue().entries()).forEach(entry => {
      this.getDelegationStatusOfAddress(entry[0], true).catch(handleErrorSentry(ErrorCategory.OPERATIONS_PROVIDER))
    })
  }

  public async prepareOriginate(wallet: AirGapMarketWallet, delegate?: string) {
    const loader = await this.getAndShowLoader()

    const protocol = new TezosProtocol()

    try {
      const originateTx = await protocol.originate(wallet.publicKey, delegate)
      const serializedTx = await this.serializeTx(wallet, originateTx)
      return this.getPageDetails(wallet, originateTx, serializedTx)
    } finally {
      this.hideLoader(loader)
    }
  }

  public async prepareDelegate(wallet: AirGapMarketWallet, delegateTargetAddress?: string) {
    const loader = await this.getAndShowLoader()

    const protocol = new TezosKtProtocol()

    try {
      const delegateTx = await protocol.delegate(wallet.publicKey, wallet.receivingPublicAddress, delegateTargetAddress)
      const serializedTx = await this.serializeTx(wallet, delegateTx)
      return this.getPageDetails(wallet, delegateTx, serializedTx)
    } finally {
      this.hideLoader(loader)
    }
  }

  private async serializeTx(
    wallet: AirGapMarketWallet,
    transaction: RawTezosTransaction | RawEthereumTransaction | RawBitcoinTransaction | RawAeternityTransaction
  ) {
    const syncProtocol = new SyncProtocolUtils()
    return syncProtocol.serialize({
      version: 1,
      protocol: wallet.coinProtocol.identifier,
      type: EncodedType.UNSIGNED_TRANSACTION,
      payload: {
        publicKey: wallet.publicKey,
        transaction: transaction,
        callback: 'airgap-wallet://?d='
      }
    })
  }

  public async checkDelegated(address: string): Promise<DelegationInfo> {
    const protocol = new TezosKtProtocol()
    return protocol.isAddressDelegated(address)
  }

  public async prepareTransaction(
    wallet: AirGapMarketWallet,
    address: string,
    amount: BigNumber,
    fee: BigNumber
  ): Promise<{ airGapTx: IAirGapTransaction; serializedTx: string }> {
    const loader = await this.getAndShowLoader()

    try {
      // TODO: This is an UnsignedTransaction, not an IAirGapTransaction
      const rawUnsignedTx: any = await wallet.prepareTransaction([address], [amount], fee)

      const airGapTx = await wallet.coinProtocol.getTransactionDetails({
        publicKey: wallet.publicKey,
        transaction: rawUnsignedTx
      })

      const serializedTx = await this.serializeTx(wallet, rawUnsignedTx)

      return { airGapTx, serializedTx }
    } catch (error) {
      handleErrorSentry(ErrorCategory.COINLIB)(error)

      this.toastController
        .create({
          message: error,
          duration: 3000,
          position: 'bottom'
        })
        .present()
        .catch(handleErrorSentry(ErrorCategory.IONIC_TOAST))

      throw error
    } finally {
      this.hideLoader(loader)
    }
  }

  private async getPageDetails(
    wallet: AirGapMarketWallet,
    transaction: RawTezosTransaction | RawEthereumTransaction | RawBitcoinTransaction | RawAeternityTransaction,
    serializedTx: string
  ) {
    let airGapTx

    try {
      airGapTx = await wallet.coinProtocol.getTransactionDetails({
        publicKey: wallet.publicKey,
        transaction: transaction
      })
    } catch (e) {
      handleErrorSentry(ErrorCategory.COINLIB)(e)
    }

    return {
      page: InteractionSelectionPage,
      params: {
        wallet: wallet,
        airGapTx: airGapTx,
        data: 'airgap-vault://?d=' + serializedTx
      }
    }
  }

  private async getAndShowLoader() {
    const loader = this.loadingController.create({
      content: 'Preparing transaction...'
    })
    await loader.present().catch(handleErrorSentry(ErrorCategory.IONIC_LOADER))

    return loader
  }

  private hideLoader(loader: Loading) {
    loader.dismiss().catch(handleErrorSentry(ErrorCategory.IONIC_LOADER))
  }

  public getActionsForCoin(identifier: string): ActionType[] {
    if (identifier === 'eth') {
      return [ActionType.ADD_TOKEN]
    } else if (identifier === 'xtz') {
      return [ActionType.IMPORT_ACCOUNT, ActionType.DELEGATE]
    } else if (identifier === 'xtz-kt') {
      return [ActionType.DELEGATE]
    } else {
      return []
    }
  }
}
