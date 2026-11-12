module IosReleaseVersion
  module_function

  SEMVER_PATTERN = /\A(\d+)\.(\d+)\.(\d+)\z/.freeze

  # [major, minor, patch] for semver comparison, or nil for anything else.
  def parse(version)
    match = version.to_s.strip.match(SEMVER_PATTERN)
    return nil unless match

    [match[1].to_i, match[2].to_i, match[3].to_i]
  end

  # Highest numeric semver; skip App Store Connect’s non-semver entries.
  def max_version(versions)
    Array(versions)
      .map { |version| version.to_s.strip }
      .select { |version| parse(version) }
      .max_by { |version| parse(version) }
  end

  # Apple errors 90062/90186 close every version <= highest_closed, including versions without their own record.
  def closed_train?(version, highest_closed)
    candidate = parse(version)
    ceiling = parse(highest_closed)
    return false unless candidate && ceiling

    (candidate <=> ceiling) <= 0
  end
end
