import os
import re

ROOT_DIR = "/Users/abdulrahman/Github/Nammerha/nammerha_mobile/lib/features"

def gather_states():
    # Map: BaseState -> list of transient states (Error, Success)
    state_map = {}
    for root, _, files in os.walk(ROOT_DIR):
        for f in files:
            if f.endswith("_state.dart"):
                with open(os.path.join(root, f), 'r') as fp:
                    content = fp.read()
                
                # find all classes extending a BaseState
                # e.g. class HomeownerError extends HomeownerState
                matches = re.findall(r'class\s+([A-Za-z0-9_]+)\s+(?:extends|implements)\s+([A-Za-z0-9_]+State)', content)
                for child, base in matches:
                    if 'Error' in child or 'Success' in child:
                        if base not in state_map:
                            state_map[base] = []
                        if child not in state_map[base]:
                            state_map[base].append(child)
    return state_map

def inject_buildwhen():
    state_map = gather_states()
    files_modified = 0
    
    for root, _, files in os.walk(ROOT_DIR):
        for f in files:
            if f.endswith(".dart"):
                path = os.path.join(root, f)
                with open(path, 'r') as fp:
                    content = fp.read()
                
                # We need to find BlocConsumer<Bloc, BaseState> that is missing buildWhen:
                if 'BlocConsumer' in content and 'buildWhen:' not in content:
                    # let's find the BlocConsumer declaration
                    pattern = r'BlocConsumer<([A-Za-z0-9_]+Bloc),\s*([A-Za-z0-9_]+State)>\(\s*(?:key:\s*[A-Za-z0-9_\.\(\)]+,\s*)?'
                    
                    def replacer(match):
                        bloc_name = match.group(1)
                        base_state = match.group(2)
                        
                        transients = state_map.get(base_state, [])
                        
                        # Fallback if we didn't statically find the classes
                        if not transients:
                            build_when_str = "buildWhen: (previous, current) {\n        if (current.runtimeType == previous.runtimeType) return false;\n        final s = current.toString();\n        return !s.contains('Error') && !s.contains('Success');\n      },"
                        else:
                            conditions = ["current is! " + t for t in transients]
                            cond_str = " && ".join(conditions)
                            build_when_str = f"buildWhen: (previous, current) => {cond_str},"
                            
                        # Preserve original match and add buildWhen inside
                        return f"{match.group(0)}\n        {build_when_str}"
                    
                    new_content = re.sub(pattern, replacer, content)
                    if new_content != content:
                        with open(path, 'w') as fp:
                            fp.write(new_content)
                        print(f"Injected buildWhen into {f}")
                        files_modified += 1
                        
    print(f"Total files hardened: {files_modified}")

if __name__ == "__main__":
    inject_buildwhen()
