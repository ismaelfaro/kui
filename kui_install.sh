
echo Installing KUI

KUIPATH="~/.kui"
KUI="~/.kui/bin/"

curl -sL https://tarball.kui-shell.org | tar jxf -

if [ -f ~/.kui ]; then
    echo "updating"
else 
    mv kui ~/.kui
    
    if [ -f ~/.zshrc ]; then
        echo "adding path in .zshrc"
        echo "\n#PATH for the KUI" >> ~/.zshrc
        echo "export PATH=\$PATH:$KUI" >> ~/.zshrc
    else
        echo "adding path in bash"
        echo "\n#PATH for the KUI" >> ~/.bashrc
        echo "export PATH=\$PATH:$KUI" >> ~/.bashrc
    fi
fi

export PATH=$PATH:$KUI

echo "Installaton complete \n - to execute use: kui \n\n - to execute the shell: kui shell"

kui shell





