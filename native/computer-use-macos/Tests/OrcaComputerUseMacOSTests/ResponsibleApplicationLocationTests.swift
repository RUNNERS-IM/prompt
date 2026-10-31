import Foundation
import Testing
@testable import OrcaComputerUseMacOSCore

@Suite("ResponsibleApplicationLocation")
struct ResponsibleApplicationLocationTests {
    private let nestedHelper = URL(fileURLWithPath: "/Applications/Prompt.app/Contents/Resources/Prompt Computer Use.app")

    @Test("prefers the host app Prompt passes explicitly")
    func explicitHostApp() {
        let url = ResponsibleApplicationLocation.resolve(
            arguments: ["--permission", "accessibility", "--host-app", "/Users/me/Apps/Prompt.app"],
            helperBundleURL: nestedHelper
        )
        #expect(url.path == "/Users/me/Apps/Prompt.app")
    }

    @Test("falls back to the app that bundles the helper")
    func nestedHelperBundle() {
        let url = ResponsibleApplicationLocation.resolve(arguments: ["--permissions"], helperBundleURL: nestedHelper)
        #expect(url.path == "/Applications/Prompt.app")
    }

    @Test("ignores an empty or missing --host-app value")
    func emptyHostApp() {
        #expect(ResponsibleApplicationLocation.resolve(arguments: ["--host-app", ""], helperBundleURL: nestedHelper).path == "/Applications/Prompt.app")
        #expect(ResponsibleApplicationLocation.resolve(arguments: ["--host-app"], helperBundleURL: nestedHelper).path == "/Applications/Prompt.app")
    }

    @Test("keeps a standalone dev helper as its own tile")
    func standaloneHelper() {
        let dev = URL(fileURLWithPath: "/repo/native/computer-use-macos/.build/release/Prompt Computer Use.app")
        #expect(ResponsibleApplicationLocation.resolve(arguments: ["--permissions"], helperBundleURL: dev) == dev)
    }

    @Test("names the tile after the bundle")
    func displayName() {
        #expect(ResponsibleApplicationLocation.displayName(of: URL(fileURLWithPath: "/Applications/Prompt.app")) == "Prompt")
    }
}
