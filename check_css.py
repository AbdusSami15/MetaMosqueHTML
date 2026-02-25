import sys

def check_braces(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    stack = []
    line_no = 1
    col_no = 1
    
    for i, char in enumerate(content):
        if char == '\n':
            line_no += 1
            col_no = 1
        else:
            col_no += 1
            
        if char == '{':
            stack.append((line_no, col_no))
        elif char == '}':
            if not stack:
                print(f"Extra closing brace at line {line_no}, column {col_no}")
                return
            stack.pop()
            
    if stack:
        for line, col in stack:
            print(f"Unclosed opening brace at line {line, col}")
    else:
        print("All braces are balanced.")

if __name__ == "__main__":
    check_braces(sys.argv[1])
