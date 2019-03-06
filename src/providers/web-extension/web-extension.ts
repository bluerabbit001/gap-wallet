import { Injectable } from '@angular/core'
import { ActiveAccountProvider } from '../active-account/active-account'
declare let chrome

@Injectable()
export class WebExtensionProvider {
  constructor(public activeAccountsProvider: ActiveAccountProvider) {
    this.activeAccountsProvider.refreshPageSubject.subscribe(() => {
      if (this.isWebExtension()) {
        this.refreshWindow()
      }
    })
  }

  isWebExtension() {
    if (chrome.runtime && chrome.runtime.id) {
      // Code running in a Chrome extension (content script, background page, etc.)
      return true
    }
  }

  refreshWindow() {
    chrome.tabs.getSelected(null, function(tab) {
      const code = 'window.location.reload()'
      chrome.tabs.executeScript(tab.id, { code: code })
    })
  }
}
