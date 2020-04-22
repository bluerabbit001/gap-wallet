import {
  BeaconMessageType,
  BeaconRequestOutputMessage,
  BeaconResponseInputMessage,
  BroadcastResponseInput,
  OperationResponseInput,
  P2PPairInfo,
  SignPayloadResponseInput,
  WalletClient
} from '@airgap/beacon-sdk'
import { Injectable } from '@angular/core'
import { ModalController } from '@ionic/angular'
import { BeaconRequestPage } from 'src/app/pages/beacon-request/beacon-request.page'

import { ErrorCategory, handleErrorSentry } from '../sentry-error-handler/sentry-error-handler'

@Injectable({
  providedIn: 'root'
})
export class BeaconService {
  private client: WalletClient | undefined
  private requests: [string, any][] = []

  constructor(private readonly modalController: ModalController) {
    this.init()
  }

  public async init(): Promise<boolean> {
    this.client = new WalletClient({ name: 'AirGapWallet' })
    await this.client.init()

    return this.client.connect(async message => {
      console.log('WALLET gotEncryptedMessage:', message)

      console.log('typeof', typeof message)

      await this.presentModal(message)
    })
  }

  async presentModal(request: BeaconRequestOutputMessage) {
    console.log('presentModal')
    const modal = await this.modalController.create({
      component: BeaconRequestPage,
      componentProps: {
        request,
        client: this.client,
        beaconService: this
      }
    })

    return modal.present()
  }

  public async addVaultRequest(messageId: string, requestPayload: any) {
    this.requests.push([messageId, requestPayload])
  }

  public async getVaultRequest(signedMessage: string, hash: string) {
    // TODO: Refactor this once we have IDs in the serializer between Wallet <=> Vault
    this.requests = this.requests.filter(request => {
      if (signedMessage === request[1]) {
        const broadcastResponse: BroadcastResponseInput = {
          id: request[0],
          type: BeaconMessageType.BroadcastResponse,
          transactionHash: hash
        }
        this.respond(broadcastResponse).catch(handleErrorSentry(ErrorCategory.BEACON))

        return false
      } else if (signedMessage.startsWith(request[1])) {
        const signPayloadResponse: SignPayloadResponseInput = {
          id: request[0],
          type: BeaconMessageType.SignPayloadResponse,
          signature: signedMessage.substr(signedMessage.length - 128)
        }
        this.respond(signPayloadResponse).catch(handleErrorSentry(ErrorCategory.BEACON))

        return false
      } else if (signedMessage.startsWith(request[1].binaryTransaction)) {
        const operationResponse: OperationResponseInput = {
          id: request[0],
          type: BeaconMessageType.OperationResponse,
          transactionHash: hash
        }
        this.respond(operationResponse).catch(handleErrorSentry(ErrorCategory.BEACON))

        return false
      } else {
        console.log('NO MATCH', signedMessage, request[1].binaryTransaction)

        return true
      }
    })
  }

  public async respond(message: BeaconResponseInputMessage): Promise<void> {
    if (!this.client) {
      throw new Error('Client not ready')
    }
    console.log('responding', message)
    await this.client.respond(message)
  }

  public async addPeer(pubKey: string, relayServer: string, name: string): Promise<void> {
    this.client.addPeer({ pubKey, relayServer, name } as any)
  }

  public async getPeers(): Promise<P2PPairInfo[]> {
    return this.client.getPeers() as any
  }

  public async removePeer(peer: P2PPairInfo): Promise<void> {
    await this.client.removePeer(peer as any)
  }

  public async removeAllPeers(): Promise<void> {
    await this.client.removeAllPeers()
  }
}
