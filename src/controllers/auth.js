const User = require('../models/user');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const password = require('secure-random-password');
const bcrypt = require('bcrypt');
const OAUTH_CLIENTID = process.env.OAUTH_CLIENTID;
const SECRET_STRING = process.env.SECRET_STRING;
const SEND_EMAIL_PASS = process.env.SEND_EMAIL_PASS;

const client = new OAuth2Client(OAUTH_CLIENTID);

exports.verifyEmail = async (req, res) => {
  try {
    let otp = password.randomPassword({
      length: 6,
      characters: password.digits,
    });
    let mailOptions = {
      from: '"Connect Book" <connectbook8@gmail.com>', // sender address
      to: req.body.email, // list of receivers
      subject: 'Verify Your email address', // Subject line
      text: `Dear ${req.body.name}, One time password to verify your gmail is ${otp}`,
    };
    await this.sendMail(mailOptions);

    let hashedOtp = await bcrypt.hash(otp, 8);

    res.json({ hashedOtp });
  } catch (err) {
    res.status(400).send(err);
  }
};

exports.verifyToken = async (req, res) => {
  console.log(req.body);
  try {
    const isVerified = await bcrypt.compare(
      req.body.otp,
      req.body.hashedOtp.hashedOtp
    );
    if (!isVerified) {
      return res.status(400).send('Please enter a valid otp');
    }

    res.json({ isEmailVerified: true });
  } catch (err) {
    res.status(400).send(err);
  }
};

exports.signup = async (req, res) => {
  try {
    // console.log('Inside signup');
    // console.log(req.body);

    const userFound = await User.findOne({ email: req.body.email });
    if (userFound) {
      console.log(userFound);
      return res.status(400).send('Email already registered');
    }

    const user = new User(req.body);
    await user.save((err, data) => {
      if (err) {
        console.log('sign up failure in try');
        return res.status(400).send({ error: 'account already exists' });
      }

      console.log('signup successful');
      const { _id, email, name } = data;
      res.json({ user: { _id, name, email } });
    });
  } catch (e) {
    console.log('sign up failure');
    console.log(e);
    res.status(500).send(e);
  }
};

exports.login = async (req, res) => {
  try {
    const user = await User.findByCredentials(
      req.body.email,
      req.body.password
    );
    // console.log('found');
    const token = await user.generateAuthToken();
    const {
      _id,
      name,
      email,
      profilePicture,
      coverPicture,
      followers,
      followings,
    } = user;
    console.log(user);
    res.json({
      user: {
        _id,
        name,
        email,
        profilePicture,
        coverPicture,
        followers,
        followings,
      },
      token,
    });
  } catch (e) {
    console.log('something went wrong');
    console.log(e);
    res.status(500).send(e);
  }
};

// exports.logout = async (req, res) => {
//   try {
//     console.log('Inside Logout');
//     req.user.tokens = req.user.tokens.filter((token) => {
//       return token.token !== req.token;
//     });
//     await req.user.save();

//     res.send('Successfully logged out');
//   } catch (e) {
//     res.status(500).send();
//   }
// }

exports.googleLogin = async (req, res) => {
  try {
    console.log('Inside google Login');
    const { tokenId } = req.body;

    client
      .verifyIdToken({
        idToken: tokenId,
        audience:
          OAUTH_CLIENTID,
      })
      .then((response) => {
        // console.log(response.payload);
        const { email_verified, name, email } = response.payload;

        if (email_verified) {
          console.log('email is verified');
          User.findOne({ email }).exec((err, user) => {
            if (err) {
              console.log(e);
              return res.status(400).json({
                error: 'Something went wrong...',
              });
            } else {
              if (user) {
                console.log('User found');
                const token = user.generateAuthToken();
                const {
                  _id,
                  name,
                  email,
                  profilePicture,
                  coverPicture,
                  followers,
                  followings,
                } = user;

                res.json({
                  user: {
                    _id,
                    name,
                    email,
                    followers,
                    followings,
                    profilePicture,
                    coverPicture,
                  },
                  token,
                });
              } else {
                console.log('Creating user');
                let password = email + 'addedstring';
                const newUser = new User({ name, email, password });
                newUser.save((err, data) => {
                  if (err) {
                    console.log('Error in creating user', err);
                    return res.status(400).json({
                      error: 'Something went wrong...',
                    });
                  }

                  const token = jwt.sign({ _id: data._id }, SECRET_STRING, {  // TOENV
                    expiresIn: '7d',
                  });
                  const {
                    _id,
                    name,
                    email,
                    profilePicture,
                    coverPicture,
                    followers,
                    followings,
                  } = newUser;
                  console.log('User created successfully');
                  res.json({
                    user: {
                      _id,
                      name,
                      email,
                      profilePicture,
                      coverPicture,
                      followers,
                      followings,
                    },
                    token,
                  });
                });
              }
            }
          });
        } else {
          console.log('Email is not verified');
        }
      });
  } catch (e) {
    console.log(e);
    res.status(400).send('Something went wrong...');
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    console.log(req.body);
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res.status(400).send('User not found');
    }

    let newPassword = password.randomPassword({
      length: 10,
    });

    user.password = newPassword;
    await user.save();

    let mailOptions = {
      from: '"Connect Book" <connectbook8@gmail.com>', // sender address
      to: req.body.email, // list of receivers
      subject: 'New Password Details', // Subject line
      text: `Dear ${req.body.name}, your new password to login is ${newPassword}`,
    };
    await this.sendMail(mailOptions);

    res.status(200).send('new login password sent to email address');
  } catch (err) {
    console.log(err);
    res.status(500).send(err);
  }
};

exports.sendMail = async (mailOptions) => {
  let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'connectbook8@gmail.com',
      pass: SEND_EMAIL_PASS, 
    },
  });

  transporter.sendMail(mailOptions, function (err, info) {
    if (err) {
      // console.log(err);
      throw new Error('Please Enter a valid Email Address');
    } else if (info.response.ok) {
    }
  });
};
