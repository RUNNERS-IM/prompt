// Contract probe for native/prompt-native/src/shipit_scheduling.rs, built and run by
// config/scripts/macos-shipit-scheduling.test.mjs inside a throwaway Probe.app (Squirrel names the job after the
// main bundle's identifier, so the probe needs one). It loads the pinned Electron's real Squirrel frameworks, reads
// the job dictionary, installs the hook through prompt-native's C export, reads it again and prints the result as
// JSON only if exactly ProcessType changed. Exit codes: 2 framework load, 3 module load, 4 missing export,
// 5 hook refused, 6 other keys changed.
#import <Foundation/Foundation.h>
#import <dlfcn.h>

@interface NSObject (PromptShipItProbe)
+ (id)shipItJobDictionary;
- (id)subscribeNext:(void (^)(id))next;
@end

int main(int argc, char **argv) {
  @autoreleasepool {
    if (argc != 3) return 1;
    NSString *frameworks = [NSString stringWithUTF8String:argv[1]];
    for (NSString *name in @[@"Mantle", @"ReactiveObjC", @"Squirrel"]) {
      NSString *file = [frameworks stringByAppendingFormat:@"/%@.framework/%@", name, name];
      if (!dlopen(file.UTF8String, RTLD_LAZY | RTLD_GLOBAL)) return 2;
    }
    // The N-API symbols stay unresolved: nothing here calls them, and RTLD_LAZY binds functions on first call.
    void *module = dlopen(argv[2], RTLD_LAZY | RTLD_LOCAL);
    if (!module) return 3;
    bool (*configure)(void) = dlsym(module, "prompt_native_configure_shipit_scheduling");
    if (!configure) return 4;
    Class launcher = NSClassFromString(@"SQRLShipItLauncher");
    [[launcher shipItJobDictionary] subscribeNext:^(NSDictionary *before) {
      if (!configure() || !configure()) exit(5);
      [[launcher shipItJobDictionary] subscribeNext:^(NSDictionary *after) {
        NSMutableDictionary *expected = [before mutableCopy];
        expected[@"ProcessType"] = @"Interactive";
        if (![expected isEqual:after]) exit(6);
        NSData *json = [NSJSONSerialization dataWithJSONObject:after options:0 error:nil];
        puts([[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding].UTF8String);
        exit(0);
      }];
    }];
    [[NSRunLoop mainRunLoop] run];
  }
  return 7;
}
