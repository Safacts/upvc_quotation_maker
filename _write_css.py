css = open('_css_content.txt').read()  
with open('app/upvc/upvc-web.css', 'w') as f:  
    f.write(css)  
print('Done') 
