Pod::Spec.new do |s|
  s.name           = 'SecureVaultCloudKit'
  s.version        = '1.0.0'
  s.summary        = 'CloudKit private-database sync for the SecPass encrypted vault'
  s.description    = 'Reads and writes VaultMeta and per-credential ciphertext in the user private CloudKit database.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true
  s.frameworks     = 'CloudKit'

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
