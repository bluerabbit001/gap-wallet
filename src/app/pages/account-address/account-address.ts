import { ClipboardService } from '@airgap/angular-core'
import { Component } from '@angular/core'
import { ActivatedRoute } from '@angular/router'
import { NavController } from '@ionic/angular'
import { AirGapMarketWallet } from 'airgap-coin-lib'

import { AccountProvider } from 'src/app/services/account/account.provider'

@Component({
  selector: 'page-account-address',
  templateUrl: 'account-address.html',
  styleUrls: ['./account-address.scss']
})
export class AccountAddressPage {
  public wallet: AirGapMarketWallet
  public publicKey: string
  public protocolID: string
  public addressIndex: undefined

  constructor(
    private readonly navController: NavController,
    private readonly route: ActivatedRoute,

    private readonly clipboardProvider: ClipboardService,
    public readonly accountProvider: AccountProvider
  ) {
    this.publicKey = this.route.snapshot.params.publicKey
    this.protocolID = this.route.snapshot.params.protocolID
    this.addressIndex = this.route.snapshot.params.addressIndex
    if (this.addressIndex === 'undefined') {
      this.addressIndex = undefined
    }
    this.wallet = this.accountProvider.walletByPublicKeyAndProtocolAndAddressIndex(this.publicKey, this.protocolID, this.addressIndex)
  }

  public async copyAddressToClipboard(): Promise<void> {
    await this.clipboardProvider.copyAndShowToast(this.wallet.receivingPublicAddress)
  }

  public async done(): Promise<void> {
    await this.navController.pop()
  }
}
