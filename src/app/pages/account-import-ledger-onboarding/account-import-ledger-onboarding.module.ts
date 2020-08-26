import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { IonicModule } from '@ionic/angular'
import { TranslateModule } from '@ngx-translate/core'

import { ComponentsModule } from '../../components/components.module'

import { AccountImportLedgerOnboardingPage } from './account-import-ledger-onboarding'

@NgModule({
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    ComponentsModule,
    TranslateModule,
    RouterModule.forChild([{ path: '', component: AccountImportLedgerOnboardingPage }])
  ],
  declarations: [AccountImportLedgerOnboardingPage]
})
export class AccountImportLedgerOnboardingPageModule {}
