import Foundation

/// The app bundle macOS lists in Privacy & Security for this helper's access.
public enum ResponsibleApplicationLocation {
    /// Why: Prompt spawns the helper as its responsible child, so TCC charges Accessibility and
    /// Screen Recording to Prompt. The setup drag tile must offer that bundle, not the helper's.
    public static func resolve(arguments: [String], helperBundleURL: URL) -> URL {
        if let index = arguments.firstIndex(of: "--host-app"),
           index + 1 < arguments.count,
           !arguments[index + 1].isEmpty {
            return URL(fileURLWithPath: arguments[index + 1])
        }
        let resources = helperBundleURL.deletingLastPathComponent()
        let contents = resources.deletingLastPathComponent()
        let host = contents.deletingLastPathComponent()
        if resources.lastPathComponent == "Resources",
           contents.lastPathComponent == "Contents",
           host.pathExtension == "app" {
            return host
        }
        return helperBundleURL
    }

    public static func displayName(of appURL: URL) -> String {
        appURL.deletingPathExtension().lastPathComponent
    }
}
