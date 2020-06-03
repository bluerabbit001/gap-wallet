import {
  GetDevicesMessageReply,
  LedgerElectronBridge,
  LedgerProcessMessageType,
  OpenMessageReply,
  SendMessageReply
} from './bridge/LedgerElectronBridge'
import { LedgerConnection, LedgerConnectionType, LedgerTransport } from './LedgerTransport'

export class LedgerTransportElectron implements LedgerTransport {
  private static get bridge(): LedgerElectronBridge {
    return LedgerElectronBridge.getInstance()
  }

  public static async getConnectedDevices(connectionType: LedgerConnectionType): Promise<LedgerConnection[]> {
    const { devices }: GetDevicesMessageReply = await LedgerTransportElectron.bridge.sendToLedger(
      LedgerProcessMessageType.GET_DEVICES,
      {
        connectionType
      },
      connectionType
    )

    return devices
  }

  public static async open(connectionType?: LedgerConnectionType, descriptor?: string): Promise<LedgerTransportElectron> {
    const { transportId }: OpenMessageReply = await LedgerTransportElectron.bridge.sendToLedger(
      LedgerProcessMessageType.OPEN,
      {
        connectionType,
        descriptor
      },
      `${connectionType}_${descriptor}`
    )

    return new LedgerTransportElectron(connectionType, transportId)
  }

  private constructor(readonly connectionType: LedgerConnectionType, private readonly transportId: string) {}

  public async decorateAppApiMethods(self: Object, methods: string[], scrambleKey: string): Promise<void> {
    await LedgerTransportElectron.bridge.sendToLedger(
      LedgerProcessMessageType.DECORATE_APP,
      {
        transportId: this.transportId,
        self,
        methods,
        scrambleKey
      },
      `${this.transportId}_decorateAppApiMethods`
    )
  }

  public async send(cla: number, ins: number, p1: number, p2: number, data?: Buffer): Promise<Buffer> {
    const { response }: SendMessageReply = await LedgerTransportElectron.bridge.sendToLedger(
      LedgerProcessMessageType.SEND,
      {
        transportId: this.transportId,
        cla,
        ins,
        p1,
        p2,
        hexData: data ? data.toString('hex') : undefined
      },
      `${this.transportId}_${cla}_${ins}_${new Date().getTime().toString()}`
    )

    return Buffer.isBuffer(response) ? response : Buffer.from(response, 'hex')
  }
  public async close(): Promise<void> {
    await LedgerTransportElectron.bridge.sendToLedger(
      LedgerProcessMessageType.CLOSE,
      {
        transportId: this.transportId
      },
      this.transportId
    )
  }
}
