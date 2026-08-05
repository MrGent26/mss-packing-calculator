import Cocoa
import WebKit

let LIVE_URL = URL(string: "https://mrgent26.github.io/mss-packing-calculator/")!

class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var webView: WKWebView!

    func applicationDidFinishLaunching(_ notification: Notification) {
        let config = WKWebViewConfiguration()
        // persistent store so saved orders survive relaunches
        config.websiteDataStore = WKWebsiteDataStore.default()

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 940, height: 780),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: false)
        window.title = "MSS Packing Calculator"
        window.minSize = NSSize(width: 640, height: 480)
        window.contentView = webView
        window.center()
        window.setFrameAutosaveName("MSSPackingCalculator")
        window.makeKeyAndOrderFront(nil)

        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)

        buildMenu()
        webView.load(URLRequest(url: LIVE_URL, cachePolicy: .reloadIgnoringLocalCacheData))
    }

    // offline fallback: load the copy bundled inside the app
    func loadBundledCopy() {
        if let local = Bundle.main.url(forResource: "index", withExtension: "html") {
            webView.loadFileURL(local, allowingReadAccessTo: local.deletingLastPathComponent())
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        loadBundledCopy()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        loadBundledCopy()
    }

    // a served error page (e.g. GitHub's 404) is a successful navigation, so didFail
    // never fires — catch bad HTTP statuses here and use the bundled copy instead
    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if navigationResponse.isForMainFrame,
           let http = navigationResponse.response as? HTTPURLResponse,
           http.statusCode >= 400 {
            decisionHandler(.cancel)
            loadBundledCopy()
            return
        }
        decisionHandler(.allow)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func buildMenu() {
        let mainMenu = NSMenu()

        let appItem = NSMenuItem()
        mainMenu.addItem(appItem)
        let appMenu = NSMenu()
        appItem.submenu = appMenu
        appMenu.addItem(withTitle: "About MSS Packing Calculator",
                        action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        let reload = NSMenuItem(title: "Reload", action: #selector(reloadPage), keyEquivalent: "r")
        reload.target = self
        appMenu.addItem(reload)
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Quit MSS Packing Calculator",
                        action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

        // Edit menu so copy/paste shortcuts work in input fields
        let editItem = NSMenuItem()
        mainMenu.addItem(editItem)
        let editMenu = NSMenu(title: "Edit")
        editItem.submenu = editMenu
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")

        NSApp.mainMenu = mainMenu
    }

    @objc func reloadPage() {
        webView.load(URLRequest(url: LIVE_URL, cachePolicy: .reloadIgnoringLocalCacheData))
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
